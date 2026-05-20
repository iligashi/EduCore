import { Router } from "express";
import { z } from "zod";
import { Announcement, CmsContent, Lesson, QuizQuestion } from "../../database/mongo.models.js";
import { authorize } from "../../middleware/authorize.middleware.js";
import { upload } from "../../middleware/upload.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { rows } from "../../database/mysql.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { HttpError } from "../../utils/http-error.js";

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

async function visibleCourseIds(user: Express.UserClaims) {
  if (user.role === "admin") return undefined;

  if (user.role === "instructor") {
    const courses = await rows<{ id: string }>(
      `SELECT courses.id
       FROM courses
       JOIN instructors ON instructors.id = courses.instructor_id
       WHERE instructors.user_id = :userId`,
      { userId: user.id }
    );
    return courses.map((course) => course.id);
  }

  const courses = await rows<{ id: string }>(
    `SELECT DISTINCT courses.id
     FROM courses
     JOIN classes ON classes.course_id = courses.id
     JOIN enrollments ON enrollments.class_id = classes.id
     JOIN students ON students.id = enrollments.student_id
     WHERE students.user_id = :userId`,
    { userId: user.id }
  );
  return courses.map((course) => course.id);
}

async function assertCourseWritable(user: Express.UserClaims, courseId: string) {
  if (user.role === "admin") return;

  const [course] = await rows<{ id: string }>(
    `SELECT courses.id
     FROM courses
     JOIN instructors ON instructors.id = courses.instructor_id
     WHERE courses.id = :courseId AND instructors.user_id = :userId`,
    { courseId, userId: user.id }
  );

  if (!course) {
    throw new HttpError(403, "You can only manage content for your own courses");
  }
}

cmsRoutes.get(
  "/lessons",
  asyncHandler(async (req, res) => {
    const requestedCourseId = req.query.courseId ? String(req.query.courseId) : undefined;
    const courseIds = await visibleCourseIds(req.user!);
    const query: Record<string, unknown> = {};

    if (requestedCourseId) query.courseId = requestedCourseId;
    if (courseIds) {
      query.courseId = requestedCourseId && courseIds.includes(requestedCourseId) ? requestedCourseId : { $in: courseIds };
    }
    if (req.user?.role === "student") query.published = true;

    const data = await Lesson.find(query).sort({ order: 1, createdAt: -1 });
    res.json({ data });
  })
);

cmsRoutes.post(
  "/lessons",
  authorize("admin"),
  validate(lessonSchema),
  asyncHandler(async (req, res) => {
    await assertCourseWritable(req.user!, req.body.courseId);
    const lesson = await Lesson.create(req.body);
    res.status(201).json(lesson);
  })
);

cmsRoutes.put(
  "/lessons/:id",
  authorize("admin"),
  validate(z.object({ params: z.object({ id: z.string() }), body: lessonSchema.shape.body.partial() })),
  asyncHandler(async (req, res) => {
    const existing = await Lesson.findById(req.params.id);
    if (!existing) throw new HttpError(404, "Lesson not found");
    await assertCourseWritable(req.user!, String(existing.courseId));
    if (req.body.courseId) await assertCourseWritable(req.user!, req.body.courseId);
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
    const requestedCourseId = req.query.courseId ? String(req.query.courseId) : undefined;
    const courseIds = await visibleCourseIds(req.user!);
    const query: Record<string, unknown> = {};

    if (requestedCourseId) query.courseId = requestedCourseId;
    if (courseIds) {
      query.$or = [
        { courseId: requestedCourseId && courseIds.includes(requestedCourseId) ? requestedCourseId : { $in: courseIds } },
        { courseId: { $exists: false } },
        { courseId: null }
      ];
    }
    if (req.user?.role !== "admin") {
      query.audience = { $in: ["all", req.user!.role] };
    }

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
    const payload = { ...req.body };
    if (payload.courseId) await assertCourseWritable(req.user!, payload.courseId);
    if (req.user?.role === "instructor" && payload.audience !== "student") {
      payload.audience = "student";
    }
    const announcement = await Announcement.create(payload);
    res.status(201).json(announcement);
  })
);

cmsRoutes.get(
  "/pages",
  authorize("admin"),
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
    const lesson = await Lesson.findById(req.body.lessonId);
    if (!lesson) throw new HttpError(404, "Lesson not found");
    await assertCourseWritable(req.user!, String(lesson.courseId));
    const question = await QuizQuestion.create(req.body);
    res.status(201).json(question);
  })
);
