import { Router } from "express";
import { z } from "zod";
import { Announcement, CmsContent, Lesson, QuizQuestion } from "../../database/mongo.models.js";
import { authorize } from "../../middleware/authorize.middleware.js";
import { upload } from "../../middleware/upload.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { asyncHandler } from "../../utils/async-handler.js";

export const cmsRoutes = Router();

const lessonSchema = z.object({
  body: z.object({
    courseId: z.string().uuid(),
    title: z.string().min(2).max(180),
    content: z.string().min(1),
    blocks: z.array(z.record(z.unknown())).default([]),
    assets: z.array(z.string()).default([]),
    order: z.coerce.number().int().default(0),
    published: z.coerce.boolean().default(false)
  })
});

cmsRoutes.get(
  "/lessons",
  asyncHandler(async (req, res) => {
    const query = req.query.courseId ? { courseId: String(req.query.courseId) } : {};
    const data = await Lesson.find(query).sort({ order: 1, createdAt: -1 });
    res.json({ data });
  })
);

cmsRoutes.post(
  "/lessons",
  authorize("admin", "instructor"),
  validate(lessonSchema),
  asyncHandler(async (req, res) => {
    const lesson = await Lesson.create(req.body);
    res.status(201).json(lesson);
  })
);

cmsRoutes.put(
  "/lessons/:id",
  authorize("admin", "instructor"),
  validate(z.object({ params: z.object({ id: z.string() }), body: lessonSchema.shape.body.partial() })),
  asyncHandler(async (req, res) => {
    const lesson = await Lesson.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(lesson);
  })
);

cmsRoutes.post(
  "/assets",
  authorize("admin", "instructor"),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    res.status(201).json({ url: req.file ? `/uploads/${req.file.filename}` : null });
  })
);

cmsRoutes.get(
  "/announcements",
  asyncHandler(async (req, res) => {
    const query = req.query.courseId ? { courseId: String(req.query.courseId) } : {};
    const data = await Announcement.find(query).sort({ publishedAt: -1 });
    res.json({ data });
  })
);

cmsRoutes.post(
  "/announcements",
  authorize("admin", "instructor"),
  validate(
    z.object({
      body: z.object({
        courseId: z.string().uuid().optional(),
        title: z.string().min(2).max(180),
        body: z.string().min(2),
        audience: z.enum(["all", "admin", "instructor", "student"]).default("all")
      })
    })
  ),
  asyncHandler(async (req, res) => {
    const announcement = await Announcement.create(req.body);
    res.status(201).json(announcement);
  })
);

cmsRoutes.get(
  "/pages",
  asyncHandler(async (_req, res) => {
    const data = await CmsContent.find({}).sort({ updatedAt: -1 });
    res.json({ data });
  })
);

cmsRoutes.put(
  "/pages/:slug",
  authorize("admin"),
  validate(
    z.object({
      params: z.object({ slug: z.string().min(1) }),
      body: z.object({
        title: z.string().min(2).max(180),
        blocks: z.array(z.record(z.unknown())).default([]),
        status: z.enum(["draft", "published"]).default("draft")
      })
    })
  ),
  asyncHandler(async (req, res) => {
    const page = await CmsContent.findOneAndUpdate(
      { slug: req.params.slug },
      { ...req.body, updatedBy: req.user?.id },
      { new: true, upsert: true }
    );
    res.json(page);
  })
);

cmsRoutes.post(
  "/quiz-questions",
  authorize("admin", "instructor"),
  validate(
    z.object({
      body: z.object({
        lessonId: z.string(),
        prompt: z.string().min(2),
        type: z.enum(["single", "multiple", "text"]).default("single"),
        options: z.array(z.string()).default([]),
        correctAnswers: z.array(z.string()).default([]),
        points: z.coerce.number().min(1).default(1)
      })
    })
  ),
  asyncHandler(async (req, res) => {
    const question = await QuizQuestion.create(req.body);
    res.status(201).json(question);
  })
);

