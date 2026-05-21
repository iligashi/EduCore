import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { authorize } from "../../middleware/authorize.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { execute, rows, withTransaction } from "../../database/mysql.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { HttpError } from "../../utils/http-error.js";
import { getPagination } from "../../utils/pagination.js";
import { idParamsSchema } from "../../utils/schemas.js";

export const instructorRoutes = Router();

const createInstructorSchema = z.object({
  body: z.object({
    fullName: z.string().min(2).max(120),
    email: z.string().email().max(160),
    password: z.string().min(8).max(100),
    specialization: z.string().min(2).max(160)
  })
});

const updateInstructorSchema = idParamsSchema.extend({
  body: z.object({
    fullName: z.string().min(2).max(120).optional(),
    email: z.string().email().max(160).optional(),
    specialization: z.string().min(2).max(160).optional(),
    status: z.enum(["active", "inactive"]).optional()
  })
});

const resetInstructorPasswordSchema = idParamsSchema.extend({
  body: z.object({
    password: z.string().min(8).max(100)
  })
});

const assignInstructorClassSchema = idParamsSchema.extend({
  body: z.object({
    classId: z.string().uuid()
  })
});

async function getInstructorById(id: string) {
  const [instructor] = await rows(
    `SELECT instructors.id, instructors.specialization,
            users.id AS userId, users.full_name AS fullName, users.email, users.status,
            (
              SELECT GROUP_CONCAT(classes.id ORDER BY courses.title, classes.room SEPARATOR ',')
              FROM classes
              JOIN courses ON courses.id = classes.course_id
              WHERE courses.instructor_id = instructors.id
            ) AS classIds,
            (
              SELECT GROUP_CONCAT(CONCAT(courses.title, ' / ', classes.room) ORDER BY courses.title, classes.room SEPARATOR '; ')
              FROM classes
              JOIN courses ON courses.id = classes.course_id
              WHERE courses.instructor_id = instructors.id
            ) AS classNames
     FROM instructors
     JOIN users ON users.id = instructors.user_id
     WHERE instructors.id = :id`,
    { id }
  );

  if (!instructor) throw new HttpError(404, "Instructor not found");
  return instructor;
}

instructorRoutes.get(
  "/",
  authorize("admin", "instructor"),
  asyncHandler(async (req, res) => {
    const { pageSize, offset, page } = getPagination(req.query);
    const search = `%${String(req.query.search ?? "")}%`;
    const status = String(req.query.status ?? "");
    const specialization = `%${String(req.query.specialization ?? "")}%`;
    const classId = String(req.query.classId ?? "");
    const instructorFilter = req.user?.role === "instructor" ? "AND users.id = :userId" : "";
    const data = await rows(
      `SELECT instructors.id, instructors.specialization,
              users.id AS userId, users.full_name AS fullName, users.email, users.status,
              instructors.created_at AS createdAt,
              (
                SELECT GROUP_CONCAT(classes.id ORDER BY courses.title, classes.room SEPARATOR ',')
                FROM classes
                JOIN courses ON courses.id = classes.course_id
                WHERE courses.instructor_id = instructors.id
              ) AS classIds,
              (
                SELECT GROUP_CONCAT(CONCAT(courses.title, ' / ', classes.room) ORDER BY courses.title, classes.room SEPARATOR '; ')
                FROM classes
                JOIN courses ON courses.id = classes.course_id
                WHERE courses.instructor_id = instructors.id
              ) AS classNames
       FROM instructors
       JOIN users ON users.id = instructors.user_id
       WHERE (users.full_name LIKE :search OR users.email LIKE :search OR instructors.specialization LIKE :search)
       AND (:status = '' OR users.status = :status)
       AND instructors.specialization LIKE :specialization
       AND (:classId = '' OR EXISTS (
         SELECT 1
         FROM classes
         JOIN courses ON courses.id = classes.course_id
         WHERE courses.instructor_id = instructors.id AND classes.id = :classId
       ))
       ${instructorFilter}
       ORDER BY users.full_name
       LIMIT :pageSize OFFSET :offset`,
      { search, status, specialization, classId, pageSize, offset, userId: req.user?.id }
    );
    const [count] = await rows<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM instructors
       JOIN users ON users.id = instructors.user_id
       WHERE (users.full_name LIKE :search OR users.email LIKE :search OR instructors.specialization LIKE :search)
       AND (:status = '' OR users.status = :status)
       AND instructors.specialization LIKE :specialization
       AND (:classId = '' OR EXISTS (
         SELECT 1
         FROM classes
         JOIN courses ON courses.id = classes.course_id
         WHERE courses.instructor_id = instructors.id AND classes.id = :classId
       ))
       ${instructorFilter}`,
      { search, status, specialization, classId, userId: req.user?.id }
    );
    res.json({ data, meta: { page, pageSize, total: count.total } });
  })
);

instructorRoutes.post(
  "/",
  authorize("admin"),
  validate(createInstructorSchema),
  asyncHandler(async (req, res) => {
    const userId = uuid();
    const instructorId = uuid();
    const passwordHash = await bcrypt.hash(req.body.password, 12);
    await withTransaction(async (connection) => {
      await connection.execute(
        `INSERT INTO users (id, full_name, email, password_hash, role)
         VALUES (:userId, :fullName, :email, :passwordHash, 'instructor')`,
        {
          userId,
          fullName: req.body.fullName,
          email: req.body.email.toLowerCase(),
          passwordHash
        }
      );
      await connection.execute(
        `INSERT INTO instructors (id, user_id, specialization)
         VALUES (:instructorId, :userId, :specialization)`,
        {
          instructorId,
          userId,
          specialization: req.body.specialization
        }
      );
    });
    const instructor = await getInstructorById(instructorId);
    res.status(201).json(instructor);
  })
);

instructorRoutes.put(
  "/:id",
  authorize("admin"),
  validate(updateInstructorSchema),
  asyncHandler(async (req, res) => {
    await withTransaction(async (connection) => {
      await connection.execute(
        `UPDATE instructors SET specialization = COALESCE(:specialization, specialization) WHERE id = :id`,
        { id: req.params.id, specialization: req.body.specialization }
      );
      await connection.execute(
        `UPDATE users
         JOIN instructors ON instructors.user_id = users.id
         SET users.full_name = COALESCE(:fullName, users.full_name),
             users.email = COALESCE(:email, users.email),
             users.status = COALESCE(:status, users.status)
         WHERE instructors.id = :id`,
        {
          id: req.params.id,
          fullName: req.body.fullName,
          email: req.body.email?.toLowerCase(),
          status: req.body.status
        }
      );
    });
    const instructor = await getInstructorById(String(req.params.id));
    res.json(instructor);
  })
);

instructorRoutes.post(
  "/:id/reset-password",
  authorize("admin"),
  validate(resetInstructorPasswordSchema),
  asyncHandler(async (req, res) => {
    const passwordHash = await bcrypt.hash(req.body.password, 12);
    const result = await execute(
      `UPDATE users
       JOIN instructors ON instructors.user_id = users.id
       SET users.password_hash = :passwordHash
       WHERE instructors.id = :id`,
      { id: req.params.id, passwordHash }
    );
    if (!result.affectedRows) throw new HttpError(404, "Instructor not found");
    await execute(
      `UPDATE refresh_tokens
       JOIN users ON users.id = refresh_tokens.user_id
       JOIN instructors ON instructors.user_id = users.id
       SET refresh_tokens.revoked_at = NOW()
       WHERE instructors.id = :id AND refresh_tokens.revoked_at IS NULL`,
      { id: req.params.id }
    );
    res.json({ message: "Instructor password reset" });
  })
);

instructorRoutes.put(
  "/:id/class-assignment",
  authorize("admin"),
  validate(assignInstructorClassSchema),
  asyncHandler(async (req, res) => {
    const [instructor] = await rows<{ id: string }>("SELECT id FROM instructors WHERE id = :id", {
      id: req.params.id
    });
    if (!instructor) throw new HttpError(404, "Instructor not found");

    const [classRecord] = await rows<{ courseId: string }>(
      `SELECT courses.id AS courseId
       FROM classes
       JOIN courses ON courses.id = classes.course_id
       WHERE classes.id = :classId`,
      { classId: req.body.classId }
    );
    if (!classRecord) throw new HttpError(404, "Class not found");

    await execute("UPDATE courses SET instructor_id = :instructorId WHERE id = :courseId", {
      instructorId: req.params.id,
      courseId: classRecord.courseId
    });
    res.json(await getInstructorById(String(req.params.id)));
  })
);

instructorRoutes.delete(
  "/:id",
  authorize("admin"),
  validate(idParamsSchema),
  asyncHandler(async (req, res) => {
    await withTransaction(async (connection) => {
      await connection.execute(
        `DELETE users FROM users
         JOIN instructors ON instructors.user_id = users.id
         WHERE instructors.id = :id`,
        { id: req.params.id }
      );
    });
    res.status(204).send();
  })
);
