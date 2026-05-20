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

instructorRoutes.get(
  "/",
  asyncHandler(async (req, res) => {
    const { pageSize, offset, page } = getPagination(req.query);
    const search = `%${String(req.query.search ?? "")}%`;
    const instructorFilter = req.user?.role === "instructor" ? "AND users.id = :userId" : "";
    const data = await rows(
      `SELECT instructors.id, instructors.specialization,
              users.id AS userId, users.full_name AS fullName, users.email, users.status,
              instructors.created_at AS createdAt
       FROM instructors
       JOIN users ON users.id = instructors.user_id
       WHERE (users.full_name LIKE :search OR users.email LIKE :search OR instructors.specialization LIKE :search)
       ${instructorFilter}
       ORDER BY users.full_name
       LIMIT :pageSize OFFSET :offset`,
      { search, pageSize, offset, userId: req.user?.id }
    );
    const [count] = await rows<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM instructors
       JOIN users ON users.id = instructors.user_id
       WHERE (users.full_name LIKE :search OR users.email LIKE :search OR instructors.specialization LIKE :search)
       ${instructorFilter}`,
      { search, userId: req.user?.id }
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
    const [instructor] = await rows(
      `SELECT instructors.id, instructors.specialization,
              users.id AS userId, users.full_name AS fullName, users.email, users.status
       FROM instructors JOIN users ON users.id = instructors.user_id WHERE instructors.id = :id`,
      { id: instructorId }
    );
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
    const [instructor] = await rows(
      `SELECT instructors.id, instructors.specialization,
              users.id AS userId, users.full_name AS fullName, users.email, users.status
       FROM instructors JOIN users ON users.id = instructors.user_id WHERE instructors.id = :id`,
      { id: req.params.id }
    );
    res.json(instructor);
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

