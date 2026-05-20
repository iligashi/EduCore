import path from "node:path";
import { fileURLToPath } from "node:url";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";
import YAML from "yamljs";
import { env, isProduction } from "./config/env.js";
import { errorMiddleware } from "./middleware/error.middleware.js";
import { authenticate } from "./middleware/auth.middleware.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { attendanceRoutes } from "./modules/attendance/attendance.routes.js";
import { assignmentRoutes } from "./modules/assignments/assignment.routes.js";
import { cmsRoutes } from "./modules/cms/cms.routes.js";
import { courseRoutes } from "./modules/courses/course.routes.js";
import { importExportRoutes } from "./modules/imports/import-export.routes.js";
import { instructorRoutes } from "./modules/instructors/instructor.routes.js";
import { notificationRoutes } from "./modules/notifications/notification.routes.js";
import { recommendationRoutes } from "./modules/recommendations/recommendation.routes.js";
import { reportRoutes } from "./modules/reports/report.routes.js";
import { searchRoutes } from "./modules/search/search.routes.js";
import { studentRoutes } from "./modules/students/student.routes.js";
import { userRoutes } from "./modules/users/user.routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const swaggerDocument = YAML.load(path.resolve(__dirname, "../docs/openapi.yaml"));

export const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true
  })
);
app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(isProduction ? "combined" : "dev"));
app.use(
  rateLimit({
    windowMs: 60_000,
    limit: 240
  })
);
app.use("/uploads", express.static(path.resolve(env.UPLOAD_DIR)));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "educore-api" });
});

app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.use("/api/auth", authRoutes);
app.use("/api/users", authenticate, userRoutes);
app.use("/api/students", authenticate, studentRoutes);
app.use("/api/instructors", authenticate, instructorRoutes);
app.use("/api/courses", authenticate, courseRoutes);
app.use("/api/assignments", authenticate, assignmentRoutes);
app.use("/api/attendance", authenticate, attendanceRoutes);
app.use("/api/notifications", authenticate, notificationRoutes);
app.use("/api/reports", authenticate, reportRoutes);
app.use("/api/search", authenticate, searchRoutes);
app.use("/api/cms", authenticate, cmsRoutes);
app.use("/api/recommendations", authenticate, recommendationRoutes);
app.use("/api", authenticate, importExportRoutes);

app.use((_req, res) => {
  res.status(404).json({ message: "Route not found" });
});

app.use(errorMiddleware);
