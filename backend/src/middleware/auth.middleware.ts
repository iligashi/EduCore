import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { HttpError } from "../utils/http-error.js";
import { isRole } from "../utils/roles.js";

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

  if (!token) {
    throw new HttpError(401, "Missing access token");
  }

  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
    if (
      typeof decoded !== "object" ||
      typeof decoded.sub !== "string" ||
      typeof decoded.email !== "string" ||
      typeof decoded.fullName !== "string" ||
      !isRole(decoded.role)
    ) {
      throw new Error("Invalid token payload");
    }

    req.user = {
      id: decoded.sub,
      email: decoded.email,
      fullName: decoded.fullName,
      role: decoded.role
    };
    next();
  } catch {
    throw new HttpError(401, "Invalid or expired access token");
  }
}

