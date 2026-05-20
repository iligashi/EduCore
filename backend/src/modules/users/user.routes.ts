import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { authorize } from "../../middleware/authorize.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { execute, rows } from "../../database/mysql.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { getPagination } from "../../utils/pagination.js";
import { roles } from "../../utils/roles.js";
import { idParamsSchema } from "../../utils/schemas.js";

export const userRoutes = Router();

const createUserSchema = z.object({
  body: z.object({
    fullName: z.string().min(2).max(120),
    email: z.string().email().max(160),
    password: z.string().min(8).max(100),
    role: z.enum(roles),
    status: z.enum(["active", "inactive"]).default("active")
  })
});

const updateUserSchema = idParamsSchema.extend({
  body: z.object({
    fullName: z.string().min(2).max(120).optional(),
    email: z.string().email().max(160).optional(),
    role: z.enum(roles).optional(),
    status: z.enum(["active", "inactive"]).optional()
  })
});

userRoutes.get(
  "/",
  authorize("admin"),
  asyncHandler(async (req, res) => {
    const { pageSize, offset, page } = getPagination(req.query);
    const search = `%${String(req.query.search ?? "")}%`;
    const data = await rows(
      `SELECT id, full_name AS fullName, email, role, status, created_at AS createdAt
       FROM users
       WHERE full_name LIKE :search OR email LIKE :search OR role LIKE :search
       ORDER BY created_at DESC
       LIMIT :pageSize OFFSET :offset`,
      { search, pageSize, offset }
    );
    const [count] = await rows<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM users
       WHERE full_name LIKE :search OR email LIKE :search OR role LIKE :search`,
      { search }
    );
    res.json({ data, meta: { page, pageSize, total: count.total } });
  })
);

userRoutes.post(
  "/",
  authorize("admin"),
  validate(createUserSchema),
  asyncHandler(async (req, res) => {
    const passwordHash = await bcrypt.hash(req.body.password, 12);
    const id = uuid();
    await execute(
      `INSERT INTO users (id, full_name, email, password_hash, role, status)
       VALUES (:id, :fullName, :email, :passwordHash, :role, :status)`,
      {
        id,
        fullName: req.body.fullName,
        email: req.body.email.toLowerCase(),
        passwordHash,
        role: req.body.role,
        status: req.body.status
      }
    );
    const [user] = await rows(
      `SELECT id, full_name AS fullName, email, role, status, created_at AS createdAt
       FROM users WHERE id = :id`,
      { id }
    );
    res.status(201).json(user);
  })
);

userRoutes.put(
  "/:id",
  authorize("admin"),
  validate(updateUserSchema),
  asyncHandler(async (req, res) => {
    await execute(
      `UPDATE users
       SET full_name = COALESCE(:fullName, full_name),
           email = COALESCE(:email, email),
           role = COALESCE(:role, role),
           status = COALESCE(:status, status)
       WHERE id = :id`,
      {
        id: req.params.id,
        fullName: req.body.fullName,
        email: req.body.email?.toLowerCase(),
        role: req.body.role,
        status: req.body.status
      }
    );
    const [user] = await rows(
      `SELECT id, full_name AS fullName, email, role, status, created_at AS createdAt
       FROM users WHERE id = :id`,
      { id: req.params.id }
    );
    res.json(user);
  })
);

userRoutes.delete(
  "/:id",
  authorize("admin"),
  validate(idParamsSchema),
  asyncHandler(async (req, res) => {
    await execute("DELETE FROM users WHERE id = :id", { id: req.params.id });
    res.status(204).send();
  })
);

