import { Router } from "express";
import { z } from "zod";
import { CourseApplication, Notification } from "../../database/mongo.models.js";
import { rows } from "../../database/mysql.js";
import { authorize } from "../../middleware/authorize.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { getIo } from "../../realtime/socket.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { HttpError } from "../../utils/http-error.js";

export const publicApplicationRoutes = Router();
export const applicationRoutes = Router();

const optionalUuid = z
  .union([z.string().uuid(), z.literal("")])
  .optional()
  .transform((value) => value || undefined);

const publicApplicationSchema = z.object({
  body: z.object({
    fullName: z.string().min(2).max(120),
    email: z.string().email().max(160),
    phone: z.string().max(40).optional().default(""),
    courseId: optionalUuid,
    educationLevel: z.string().max(120).optional().default(""),
    message: z.string().max(1200).optional().default("")
  })
});

const applicationStatusSchema = z.object({
  params: z.object({ id: z.string() }),
  body: z.object({
    status: z.enum(["pending", "reviewed", "accepted", "rejected"]).optional(),
    notes: z.string().max(1200).optional()
  })
});

publicApplicationRoutes.get(
  "/courses",
  asyncHandler(async (_req, res) => {
    const data = await rows(
      `SELECT courses.id, courses.title, courses.description, courses.level, courses.status,
              users.full_name AS instructorName,
              COUNT(classes.id) AS classCount,
              MIN(classes.starts_at) AS nextStartAt
       FROM courses
       JOIN instructors ON instructors.id = courses.instructor_id
       JOIN users ON users.id = instructors.user_id
       LEFT JOIN classes ON classes.course_id = courses.id
       WHERE courses.status = 'published'
       GROUP BY courses.id, courses.title, courses.description, courses.level, courses.status, users.full_name
       ORDER BY courses.created_at DESC`
    );

    res.json({ data });
  })
);

publicApplicationRoutes.post(
  "/course-applications",
  validate(publicApplicationSchema),
  asyncHandler(async (req, res) => {
    let courseTitle = "General application";

    if (req.body.courseId) {
      const [course] = await rows<{ title: string }>(
        "SELECT title FROM courses WHERE id = :courseId AND status = 'published'",
        { courseId: req.body.courseId }
      );

      if (!course) {
        throw new HttpError(422, "Selected course is not available for public applications");
      }

      courseTitle = course.title;
    }

    const application = await CourseApplication.create({
      fullName: req.body.fullName,
      email: req.body.email.toLowerCase(),
      phone: req.body.phone,
      courseId: req.body.courseId,
      courseTitle,
      educationLevel: req.body.educationLevel,
      message: req.body.message
    });

    const notification = await Notification.create({
      role: "admin",
      title: "New course application",
      message: `${application.fullName} applied for ${application.courseTitle}.`,
      type: "application",
      metadata: { applicationId: application._id }
    });
    getIo()?.to("role:admin").emit("notification:new", notification);

    res.status(201).json(application);
  })
);

applicationRoutes.get(
  "/",
  authorize("admin"),
  asyncHandler(async (req, res) => {
    const status = String(req.query.status ?? "");
    const query = status ? { status } : {};
    const data = await CourseApplication.find(query).sort({ createdAt: -1 }).limit(200);
    res.json({ data });
  })
);

applicationRoutes.patch(
  "/:id",
  authorize("admin"),
  validate(applicationStatusSchema),
  asyncHandler(async (req, res) => {
    const update: Record<string, unknown> = {};
    if (req.body.status) update.status = req.body.status;
    if (typeof req.body.notes === "string") update.notes = req.body.notes;
    if (req.body.status && req.body.status !== "pending") {
      update.reviewedBy = req.user!.id;
      update.reviewedAt = new Date();
    }

    const application = await CourseApplication.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!application) {
      throw new HttpError(404, "Application not found");
    }

    res.json(application);
  })
);
