import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { HttpError } from "../utils/http-error.js";

export const errorMiddleware: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(422).json({
      message: "Validation failed",
      errors: error.flatten()
    });
    return;
  }

  if (error instanceof HttpError) {
    res.status(error.statusCode).json({
      message: error.message,
      details: error.details
    });
    return;
  }

  if (error?.code === "ER_DUP_ENTRY") {
    res.status(409).json({ message: "Duplicate record" });
    return;
  }

  console.error(error);
  res.status(500).json({ message: "Internal server error" });
};

