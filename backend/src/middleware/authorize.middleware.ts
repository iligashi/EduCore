import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../utils/http-error.js";
import type { Role } from "../utils/roles.js";

export function authorize(...allowedRoles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new HttpError(401, "Authentication required");
    }

    if (!allowedRoles.includes(req.user.role)) {
      throw new HttpError(403, "You do not have permission to perform this action");
    }

    next();
  };
}

