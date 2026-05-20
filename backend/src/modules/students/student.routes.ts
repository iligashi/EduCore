import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { authorize } from "../../middleware/authorize.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { rows, withTransaction } from "../../database/mysql.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { getPagination } from "../../utils/pagination.js";
import { idParamsSchema } from "../../utils/schemas.js";

export const studentRoutes = Router();

const createStudentSchema = z.object({
  body: z.object({
    fullName: z.string().min(2).max(120),
    email: z.string().email().max(160),
    password: z.string().min(8).max(100),
    studentCode: z.string().min(2).max(40),
    department: z.string().min(2).max(120),
    semester: z.coerce.number().int().min(1).max(12)
  })
});

const updateStudentSchema = idParamsSchema.extend({
  body: z.object({
    fullName: z.string().min(2).max(120).optional(),
    email: z.string().email().max(160).optional(),
    studentCode: z.string().min(2).max(40).optional(),
    department: z.string().min(2).max(120).optional(),
    semester: z.coerce.number().int().min(1).max(12).optional(),
    status: z.enum(["active", "inactive"]).optional()
  })
});

studentRoutes.get(
  "/",
  asyncHandler(async (req, res) => {
    const { pageSize, offset, page } = getPagination(req.query);
    const search = `%${String(req.query.search ?? "")}%`;
    const studentFilter = req.user?.role === "student" ? "AND users.id = :userId" : "";
    const data = await rows(
      `SELECT students.id, students.student_code AS studentCode, students.department, students.semester,
              users.id AS userId, users.full_name AS fullName, users.email, users.status,
              students.created_at AS createdAt
       FROM students
       JOIN users ON users.id = students.user_id
       WHERE (users.full_name LIKE :search OR users.email LIKE :search OR students.student_code LIKE :search OR students.department LIKE :search)
       ${studentFilter}
       ORDER BY users.full_name
       LIMIT :pageSize OFFSET :offset`,
      { search, pageSize, offset, userId: req.user?.id }
    );
    const [count] = await rows<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM students
       JOIN users ON users.id = students.user_id
       WHERE (users.full_name LIKE :search OR users.email LIKE :search OR students.student_code LIKE :search OR students.department LIKE :search)
       ${studentFilter}`,
      { search, userId: req.user?.id }
    );
    res.json({ data, meta: { page, pageSize, total: count.total } });
  })
);

studentRoutes.post(
  "/",
  authorize("admin"),
  validate(createStudentSchema),
  asyncHandler(async (req, res) => {
    const userId = uuid();
    const studentId = uuid();
    const passwordHash = await bcrypt.hash(req.body.password, 12);
    await withTransaction(async (connection) => {
      await connection.execute(
        `INSERT INTO users (id, full_name, email, password_hash, role)
         VALUES (:userId, :fullName, :email, :passwordHash, 'student')`,
        {
          userId,
          fullName: req.body.fullName,
          email: req.body.email.toLowerCase(),
          passwordHash
        }
      );
      await connection.execute(
        `INSERT INTO students (id, user_id, student_code, department, semester)
         VALUES (:studentId, :userId, :studentCode, :department, :semester)`,
        {
          studentId,
          userId,
          studentCode: req.body.studentCode,
          department: req.body.department,
          semester: req.body.semester
        }
      );
    });
    const [student] = await rows(
      `SELECT students.id, students.student_code AS studentCode, students.department, students.semester,
              users.id AS userId, users.full_name AS fullName, users.email, users.status
       FROM students JOIN users ON users.id = students.user_id WHERE students.id = :id`,
      { id: studentId }
    );
    res.status(201).json(student);
  })
);

studentRoutes.put(
  "/:id",
  authorize("admin"),
  validate(updateStudentSchema),
  asyncHandler(async (req, res) => {
    await withTransaction(async (connection) => {
      await connection.execute(
        `UPDATE students
         SET student_code = COALESCE(:studentCode, student_code),
             department = COALESCE(:department, department),
             semester = COALESCE(:semester, semester)
         WHERE id = :id`,
        {
          id: req.params.id,
          studentCode: req.body.studentCode,
          department: req.body.department,
          semester: req.body.semester
        }
      );
      await connection.execute(
        `UPDATE users
         JOIN students ON students.user_id = users.id
         SET users.full_name = COALESCE(:fullName, users.full_name),
             users.email = COALESCE(:email, users.email),
             users.status = COALESCE(:status, users.status)
         WHERE students.id = :id`,
        {
          id: req.params.id,
          fullName: req.body.fullName,
          email: req.body.email?.toLowerCase(),
          status: req.body.status
        }
      );
    });
    const [student] = await rows(
      `SELECT students.id, students.student_code AS studentCode, students.department, students.semester,
              users.id AS userId, users.full_name AS fullName, users.email, users.status
       FROM students JOIN users ON users.id = students.user_id WHERE students.id = :id`,
      { id: req.params.id }
    );
    res.json(student);
  })
);

studentRoutes.delete(
  "/:id",
  authorize("admin"),
  validate(idParamsSchema),
  asyncHandler(async (req, res) => {
    await withTransaction(async (connection) => {
      await connection.execute(
        `DELETE users FROM users
         JOIN students ON students.user_id = users.id
         WHERE students.id = :id`,
        { id: req.params.id }
      );
    });
    res.status(204).send();
  })
);

