import { Router } from "express";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { authorize } from "../../middleware/authorize.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { execute, rows } from "../../database/mysql.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { HttpError } from "../../utils/http-error.js";
import { getPagination } from "../../utils/pagination.js";
import { idParamsSchema } from "../../utils/schemas.js";

export const courseRoutes = Router();

const courseBody = z.object({
  title: z.string().min(2).max(180),
  description: z.string().max(5000).optional().default(""),
  instructorId: z.string().uuid().optional(),
  level: z.string().max(80).optional().default("General"),
  status: z.enum(["draft", "published", "archived"]).default("draft")
});

const classBody = z.object({
  room: z.string().min(1).max(80),
  schedule: z.record(z.unknown()).default({}),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional()
});

async function resolveInstructorId(user: Express.UserClaims, bodyInstructorId?: string) {
  if (user.role === "admin") {
    if (!bodyInstructorId) throw new HttpError(422, "instructorId is required for admin course creation");
    return bodyInstructorId;
  }

  const [instructor] = await rows<{ id: string }>("SELECT id FROM instructors WHERE user_id = :userId", {
    userId: user.id
  });
  if (!instructor) {
    throw new HttpError(403, "Instructor profile not found");
  }
  return instructor.id;
}

courseRoutes.get(
  "/",
  asyncHandler(async (req, res) => {
    const { pageSize, offset, page } = getPagination(req.query);
    const search = `%${String(req.query.search ?? "")}%`;
    const instructorFilter = req.user?.role === "instructor" ? "AND instructors.user_id = :userId" : "";
    const studentFilter =
      req.user?.role === "student"
        ? `AND EXISTS (
             SELECT 1 FROM enrollments
             JOIN classes ON classes.id = enrollments.class_id
             JOIN students ON students.id = enrollments.student_id
             WHERE classes.course_id = courses.id AND students.user_id = :userId
           )`
        : "";

    const data = await rows(
      `SELECT courses.id, courses.title, courses.description, courses.level, courses.status,
              courses.instructor_id AS instructorId, users.full_name AS instructorName,
              courses.created_at AS createdAt
       FROM courses
       JOIN instructors ON instructors.id = courses.instructor_id
       JOIN users ON users.id = instructors.user_id
       WHERE (courses.title LIKE :search OR courses.description LIKE :search OR users.full_name LIKE :search)
       ${instructorFilter}
       ${studentFilter}
       ORDER BY courses.created_at DESC
       LIMIT :pageSize OFFSET :offset`,
      { search, pageSize, offset, userId: req.user?.id }
    );
    const [count] = await rows<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM courses
       JOIN instructors ON instructors.id = courses.instructor_id
       JOIN users ON users.id = instructors.user_id
       WHERE (courses.title LIKE :search OR courses.description LIKE :search OR users.full_name LIKE :search)
       ${instructorFilter}
       ${studentFilter}`,
      { search, userId: req.user?.id }
    );
    res.json({ data, meta: { page, pageSize, total: count.total } });
  })
);

courseRoutes.post(
  "/",
  authorize("admin", "instructor"),
  validate(z.object({ body: courseBody })),
  asyncHandler(async (req, res) => {
    const instructorId = await resolveInstructorId(req.user!, req.body.instructorId);
    const id = uuid();
    await execute(
      `INSERT INTO courses (id, title, description, instructor_id, level, status)
       VALUES (:id, :title, :description, :instructorId, :level, :status)`,
      {
        id,
        title: req.body.title,
        description: req.body.description,
        instructorId,
        level: req.body.level,
        status: req.body.status
      }
    );
    const [course] = await rows("SELECT * FROM courses WHERE id = :id", { id });
    res.status(201).json(course);
  })
);

courseRoutes.put(
  "/:id",
  authorize("admin", "instructor"),
  validate(idParamsSchema.extend({ body: courseBody.partial() })),
  asyncHandler(async (req, res) => {
    await execute(
      `UPDATE courses
       SET title = COALESCE(:title, title),
           description = COALESCE(:description, description),
           level = COALESCE(:level, level),
           status = COALESCE(:status, status),
           instructor_id = COALESCE(:instructorId, instructor_id)
       WHERE id = :id`,
      {
        id: req.params.id,
        title: req.body.title,
        description: req.body.description,
        level: req.body.level,
        status: req.body.status,
        instructorId: req.body.instructorId
      }
    );
    const [course] = await rows("SELECT * FROM courses WHERE id = :id", { id: req.params.id });
    res.json(course);
  })
);

courseRoutes.delete(
  "/:id",
  authorize("admin"),
  validate(idParamsSchema),
  asyncHandler(async (req, res) => {
    await execute("DELETE FROM courses WHERE id = :id", { id: req.params.id });
    res.status(204).send();
  })
);

courseRoutes.get(
  "/classes/all",
  asyncHandler(async (req, res) => {
    const instructorFilter = req.user?.role === "instructor" ? "AND instructors.user_id = :userId" : "";
    const studentFilter =
      req.user?.role === "student"
        ? `AND EXISTS (
             SELECT 1 FROM enrollments
             JOIN students ON students.id = enrollments.student_id
             WHERE enrollments.class_id = classes.id AND students.user_id = :userId
           )`
        : "";
    const data = await rows(
      `SELECT classes.id, classes.course_id AS courseId, courses.title AS courseTitle,
              classes.room, classes.schedule, classes.starts_at AS startsAt, classes.ends_at AS endsAt
       FROM classes
       JOIN courses ON courses.id = classes.course_id
       JOIN instructors ON instructors.id = courses.instructor_id
       WHERE 1 = 1
       ${instructorFilter}
       ${studentFilter}
       ORDER BY courses.title, classes.starts_at`,
      { userId: req.user?.id }
    );
    res.json({ data });
  })
);

courseRoutes.get(
  "/:id/classes",
  validate(idParamsSchema),
  asyncHandler(async (req, res) => {
    const classes = await rows(
      `SELECT id, course_id AS courseId, room, schedule, starts_at AS startsAt, ends_at AS endsAt
       FROM classes WHERE course_id = :id ORDER BY starts_at`,
      { id: req.params.id }
    );
    res.json({ data: classes });
  })
);

courseRoutes.post(
  "/:id/classes",
  authorize("admin", "instructor"),
  validate(idParamsSchema.extend({ body: classBody })),
  asyncHandler(async (req, res) => {
    const id = uuid();
    await execute(
      `INSERT INTO classes (id, course_id, room, schedule, starts_at, ends_at)
       VALUES (:id, :courseId, :room, :schedule, :startsAt, :endsAt)`,
      {
        id,
        courseId: req.params.id,
        room: req.body.room,
        schedule: JSON.stringify(req.body.schedule),
        startsAt: req.body.startsAt ? req.body.startsAt.replace("T", " ").replace("Z", "") : null,
        endsAt: req.body.endsAt ? req.body.endsAt.replace("T", " ").replace("Z", "") : null
      }
    );
    const [created] = await rows("SELECT * FROM classes WHERE id = :id", { id });
    res.status(201).json(created);
  })
);

courseRoutes.post(
  "/classes/:id/enrollments",
  authorize("admin"),
  validate(
    z.object({
      params: z.object({ id: z.string().uuid() }),
      body: z.object({ studentId: z.string().uuid() })
    })
  ),
  asyncHandler(async (req, res) => {
    const id = uuid();
    await execute(
      `INSERT INTO enrollments (id, student_id, class_id)
       VALUES (:id, :studentId, :classId)
       ON DUPLICATE KEY UPDATE status = 'active'`,
      { id, studentId: req.body.studentId, classId: req.params.id }
    );
    res.status(201).json({ id, studentId: req.body.studentId, classId: req.params.id, status: "active" });
  })
);
