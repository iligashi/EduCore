import { Router } from "express";
import { isProduction } from "../../config/env.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { getUserById, loginUser, logout, refreshSession, registerUser } from "./auth.service.js";
import { loginSchema, refreshSchema, registerSchema } from "./auth.schemas.js";

export const authRoutes = Router();

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: isProduction,
  maxAge: 7 * 24 * 60 * 60 * 1000
};

authRoutes.post(
  "/register",
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const result = await registerUser(req.body);
    res.cookie("refreshToken", result.refreshToken, cookieOptions);
    res.status(201).json(result);
  })
);

authRoutes.post(
  "/login",
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const result = await loginUser(req.body.email, req.body.password);
    res.cookie("refreshToken", result.refreshToken, cookieOptions);
    res.json(result);
  })
);

authRoutes.post(
  "/refresh",
  validate(refreshSchema),
  asyncHandler(async (req, res) => {
    const result = await refreshSession(req.body.refreshToken ?? req.cookies.refreshToken);
    res.cookie("refreshToken", result.refreshToken, cookieOptions);
    res.json(result);
  })
);

authRoutes.post(
  "/logout",
  asyncHandler(async (req, res) => {
    await logout(req.body.refreshToken ?? req.cookies.refreshToken);
    res.clearCookie("refreshToken", cookieOptions);
    res.status(204).send();
  })
);

authRoutes.get(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    res.json({ user: await getUserById(req.user!.id) });
  })
);

