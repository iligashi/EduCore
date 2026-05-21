import { Router } from "express";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { ClassBackup, ClassDay } from "../../database/mongo.models.js";
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

const classDayBody = z.object({
  title: z.string().min(2).max(180),
  dayNumber: z.coerce.number().int().min(1).optional(),
  content: z.string().max(10000).optional().default(""),
  blocks: z.array(z.record(z.unknown())).default([]),
  assets: z.array(z.string()).default([]),
  published: z.coerce.boolean().default(false)
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

async function getClassForAccess(classId: string) {
  const [classRecord] = await rows<{ id: string; courseId: string; instructorUserId: string }>(
    `SELECT classes.id, classes.course_id AS courseId, instructors.user_id AS instructorUserId
     FROM classes
     JOIN courses ON courses.id = classes.course_id
     JOIN instructors ON instructors.id = courses.instructor_id
     WHERE classes.id = :classId`,
    { classId }
  );

  if (!classRecord) {
    throw new HttpError(404, "Class not found");
  }

  return classRecord;
}

async function assertClassWritable(user: Express.UserClaims, classId: string) {
  if (user.role === "admin") return getClassForAccess(classId);

  const classRecord = await getClassForAccess(classId);
  if (classRecord.instructorUserId !== user.id) {
    throw new HttpError(403, "You can only edit classes assigned to you");
  }

  return classRecord;
}

async function assertClassVisible(user: Express.UserClaims, classId: string) {
  if (user.role === "admin" || user.role === "instructor") {
    return assertClassWritable(user, classId);
  }

  const [classRecord] = await rows<{ id: string; courseId: string; instructorUserId: string }>(
    `SELECT classes.id, classes.course_id AS courseId, instructors.user_id AS instructorUserId
     FROM classes
     JOIN courses ON courses.id = classes.course_id
     JOIN instructors ON instructors.id = courses.instructor_id
     JOIN enrollments ON enrollments.class_id = classes.id
     JOIN students ON students.id = enrollments.student_id
     WHERE classes.id = :classId AND students.user_id = :userId`,
    { classId, userId: user.id }
  );

  if (!classRecord) {
    throw new HttpError(403, "Students can only view enrolled classes");
  }

  return classRecord;
}

async function assertCourseWritable(user: Express.UserClaims, courseId: string) {
  if (user.role === "admin") return;

  const [course] = await rows<{ id: string }>(
    `SELECT courses.id
     FROM courses
     JOIN instructors ON instructors.id = courses.instructor_id
     WHERE courses.id = :courseId AND instructors.user_id = :userId`,
    { courseId, userId: user.id }
  );

  if (!course) {
    throw new HttpError(403, "You can only manage your own courses");
  }
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
  authorize("admin"),
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
  authorize("admin"),
  validate(idParamsSchema.extend({ body: courseBody.partial() })),
  asyncHandler(async (req, res) => {
    await assertCourseWritable(req.user!, String(req.params.id));
    const instructorId = req.user!.role === "admin" ? req.body.instructorId : undefined;
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
        instructorId
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
    const instructorFilter =
      req.user?.role === "instructor"
        ? `AND EXISTS (
             SELECT 1 FROM instructors
             WHERE instructors.id = courses.instructor_id AND instructors.user_id = :userId
           )`
        : "";
    const studentFilter =
      req.user?.role === "student"
        ? `AND EXISTS (
             SELECT 1 FROM enrollments
             JOIN students ON students.id = enrollments.student_id
             WHERE enrollments.class_id = classes.id AND students.user_id = :userId
           )`
        : "";
    const classes = await rows(
      `SELECT classes.id, classes.course_id AS courseId, classes.room, classes.schedule,
              classes.starts_at AS startsAt, classes.ends_at AS endsAt
       FROM classes
       JOIN courses ON courses.id = classes.course_id
       WHERE classes.course_id = :id
       ${instructorFilter}
       ${studentFilter}
       ORDER BY classes.starts_at`,
      { id: req.params.id, userId: req.user?.id }
    );
    res.json({ data: classes });
  })
);

courseRoutes.post(
  "/:id/classes",
  authorize("admin"),
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

courseRoutes.put(
  "/classes/:id",
  authorize("admin", "instructor"),
  validate(z.object({ params: z.object({ id: z.string().uuid() }), body: classBody.partial() })),
  asyncHandler(async (req, res) => {
    await assertClassWritable(req.user!, String(req.params.id));
    await execute(
      `UPDATE classes
       SET room = COALESCE(:room, room),
           schedule = COALESCE(:schedule, schedule),
           starts_at = COALESCE(:startsAt, starts_at),
           ends_at = COALESCE(:endsAt, ends_at)
       WHERE id = :id`,
      {
        id: req.params.id,
        room: req.body.room ?? null,
        schedule: req.body.schedule ? JSON.stringify(req.body.schedule) : null,
        startsAt: req.body.startsAt ? req.body.startsAt.replace("T", " ").replace("Z", "") : null,
        endsAt: req.body.endsAt ? req.body.endsAt.replace("T", " ").replace("Z", "") : null
      }
    );
    const [updated] = await rows("SELECT * FROM classes WHERE id = :id", { id: req.params.id });
    res.json(updated);
  })
);

courseRoutes.get(
  "/classes/:id/days",
  validate(z.object({ params: z.object({ id: z.string().uuid() }) })),
  asyncHandler(async (req, res) => {
    await assertClassVisible(req.user!, String(req.params.id));
    const query: Record<string, unknown> = { classId: req.params.id };
    if (req.user?.role === "student") query.published = true;
    const data = await ClassDay.find(query).sort({ dayNumber: 1, createdAt: 1 });
    res.json({ data });
  })
);

courseRoutes.get(
  "/classes/:id/students",
  authorize("admin", "instructor"),
  validate(z.object({ params: z.object({ id: z.string().uuid() }) })),
  asyncHandler(async (req, res) => {
    await assertClassWritable(req.user!, String(req.params.id));
    const data = await rows(
      `SELECT students.id, students.user_id AS userId, students.student_code AS studentCode,
              students.department, students.semester, users.full_name AS fullName,
              users.email, users.status
       FROM enrollments
       JOIN students ON students.id = enrollments.student_id
       JOIN users ON users.id = students.user_id
       WHERE enrollments.class_id = :classId AND enrollments.status = 'active'
       ORDER BY users.full_name`,
      { classId: req.params.id }
    );
    res.json({ data });
  })
);

courseRoutes.post(
  "/classes/:id/days",
  authorize("admin", "instructor"),
  validate(z.object({ params: z.object({ id: z.string().uuid() }), body: classDayBody })),
  asyncHandler(async (req, res) => {
    const classRecord = await assertClassWritable(req.user!, String(req.params.id));
    const latest = await ClassDay.findOne({ classId: req.params.id }).sort({ dayNumber: -1 });
    const dayNumber = req.body.dayNumber ?? ((latest?.dayNumber as number | undefined) ?? 0) + 1;
    const day = await ClassDay.create({
      classId: req.params.id,
      courseId: classRecord.courseId,
      dayNumber,
      title: req.body.title,
      content: req.body.content,
      blocks: req.body.blocks,
      assets: req.body.assets,
      published: req.body.published,
      updatedBy: req.user!.id
    });
    res.status(201).json(day);
  })
);

courseRoutes.put(
  "/classes/days/:dayId",
  authorize("admin", "instructor"),
  validate(z.object({ params: z.object({ dayId: z.string() }), body: classDayBody.partial() })),
  asyncHandler(async (req, res) => {
    const day = await ClassDay.findById(req.params.dayId);
    if (!day) throw new HttpError(404, "Class day not found");
    await assertClassWritable(req.user!, String(day.classId));
    const updated = await ClassDay.findByIdAndUpdate(
      req.params.dayId,
      { ...req.body, updatedBy: req.user!.id },
      { new: true }
    );
    res.json(updated);
  })
);

courseRoutes.get(
  "/classes/:id/backups",
  authorize("admin", "instructor"),
  validate(z.object({ params: z.object({ id: z.string().uuid() }) })),
  asyncHandler(async (req, res) => {
    await assertClassWritable(req.user!, String(req.params.id));
    const data = await ClassBackup.find({ classId: req.params.id }).sort({ createdAt: -1 });
    res.json({ data });
  })
);

courseRoutes.post(
  "/classes/:id/backup",
  authorize("admin", "instructor"),
  validate(
    z.object({
      params: z.object({ id: z.string().uuid() }),
      body: z.object({
        title: z.string().min(2).max(180).optional(),
        targetClassId: z.string().uuid().optional()
      })
    })
  ),
  asyncHandler(async (req, res) => {
    const sourceClass = await assertClassWritable(req.user!, String(req.params.id));
    const days = await ClassDay.find({ classId: req.params.id }).sort({ dayNumber: 1 }).lean();
    const title = req.body.title ?? `Backup ${new Date().toISOString().slice(0, 10)}`;
    const backup = await ClassBackup.create({
      classId: req.params.id,
      title,
      createdBy: req.user!.id,
      days
    });

    if (req.body.targetClassId) {
      const targetClass = await assertClassWritable(req.user!, req.body.targetClassId);
      await ClassDay.deleteMany({ classId: req.body.targetClassId });
      const copiedDays = days.map((day) => ({
        classId: req.body.targetClassId,
        courseId: targetClass.courseId,
        dayNumber: day.dayNumber,
        title: day.title,
        content: day.content,
        blocks: day.blocks,
        assets: day.assets,
        published: false,
        updatedBy: req.user!.id
      }));
      if (copiedDays.length) await ClassDay.insertMany(copiedDays);
    }

    res.status(201).json({ backup, copiedToClassId: req.body.targetClassId ?? null, sourceCourseId: sourceClass.courseId });
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
