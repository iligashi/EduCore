import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { env } from "../../config/env.js";
import { CourseApplication, Notification } from "../../database/mongo.models.js";
import { rows, withTransaction } from "../../database/mysql.js";
import { authorize } from "../../middleware/authorize.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { getIo } from "../../realtime/socket.js";
import { sendMail, type MailResult } from "../../services/mail.service.js";
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

function temporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  return Array.from(crypto.randomBytes(14), (byte) => alphabet[byte % alphabet.length]).join("");
}

function studentCodeCandidate() {
  return `APP-${new Date().getFullYear()}-${crypto.randomInt(10000, 100000)}`;
}

async function uniqueStudentCode() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const studentCode = studentCodeCandidate();
    const [existing] = await rows<{ id: string }>("SELECT id FROM students WHERE student_code = :studentCode", { studentCode });
    if (!existing) return studentCode;
  }
  throw new HttpError(500, "Could not generate a student code");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function portalLoginUrl() {
  return `${env.CLIENT_URL.replace(/\/$/, "")}/login`;
}

async function createOrResetStudentLogin(application: {
  fullName: string;
  email: string;
  educationLevel?: string;
}) {
  const email = application.email.toLowerCase();
  const [existingUser] = await rows<{ id: string; role: "admin" | "instructor" | "student" }>(
    "SELECT id, role FROM users WHERE email = :email",
    { email }
  );

  if (existingUser && existingUser.role !== "student") {
    throw new HttpError(409, "This email already belongs to a staff account");
  }

  const userId = existingUser?.id ?? uuid();
  const password = temporaryPassword();
  const passwordHash = await bcrypt.hash(password, 12);
  const [student] = await rows<{ id: string }>("SELECT id FROM students WHERE user_id = :userId", { userId });
  const studentInsert = student
    ? null
    : {
        id: uuid(),
        userId,
        studentCode: await uniqueStudentCode(),
        department: application.educationLevel || "Admissions"
      };

  await withTransaction(async (connection) => {
    if (existingUser) {
      await connection.execute(
        `UPDATE users
         SET full_name = :fullName,
             password_hash = :passwordHash,
             status = 'active'
         WHERE id = :userId`,
        { userId, fullName: application.fullName, passwordHash }
      );
    } else {
      await connection.execute(
        `INSERT INTO users (id, full_name, email, password_hash, role, status)
         VALUES (:userId, :fullName, :email, :passwordHash, 'student', 'active')`,
        { userId, fullName: application.fullName, email, passwordHash }
      );
    }

    if (studentInsert) {
      await connection.execute(
        `INSERT INTO students (id, user_id, student_code, department, semester)
         VALUES (:id, :userId, :studentCode, :department, 1)`,
        studentInsert
      );
    }
  });

  return { userId, email, password, studentCode: studentInsert?.studentCode };
}

async function sendAcceptedEmail(application: { fullName: string; email: string; courseTitle: string }, password: string) {
  const loginUrl = portalLoginUrl();
  const safeName = escapeHtml(application.fullName);
  const safeCourse = escapeHtml(application.courseTitle);
  const safeEmail = escapeHtml(application.email.toLowerCase());
  const safePassword = escapeHtml(password);
  const safeLoginUrl = escapeHtml(loginUrl);

  return sendMail({
    to: application.email,
    subject: `EduCore application accepted: ${application.courseTitle}`,
    text: [
      `Hello ${application.fullName},`,
      "",
      `Your application for ${application.courseTitle} has been accepted.`,
      "",
      "Your EduCore student portal credentials are:",
      `Email: ${application.email.toLowerCase()}`,
      `Temporary password: ${password}`,
      `Login: ${loginUrl}`,
      "",
      "Your account has been created, but you are not enrolled in a course yet. An administrator will assign your course or class inside EduCore.",
      "",
      "EduCore Admissions"
    ].join("\n"),
    html: [
      `<p>Hello ${safeName},</p>`,
      `<p>Your application for <strong>${safeCourse}</strong> has been accepted.</p>`,
      "<p>Your EduCore student portal credentials are:</p>",
      `<ul><li>Email: <strong>${safeEmail}</strong></li><li>Temporary password: <strong>${safePassword}</strong></li></ul>`,
      `<p>Login: <a href="${safeLoginUrl}">${safeLoginUrl}</a></p>`,
      "<p>Your account has been created, but you are not enrolled in a course yet. An administrator will assign your course or class inside EduCore.</p>",
      "<p>EduCore Admissions</p>"
    ].join("")
  });
}

async function sendRejectedEmail(application: { fullName: string; email: string; courseTitle: string }) {
  const safeName = escapeHtml(application.fullName);
  const safeCourse = escapeHtml(application.courseTitle);

  return sendMail({
    to: application.email,
    subject: `EduCore application update: ${application.courseTitle}`,
    text: [
      `Hello ${application.fullName},`,
      "",
      `Thank you for applying for ${application.courseTitle}.`,
      "",
      "We are sorry, but your application has not been accepted at this time. You may apply again in a future intake.",
      "",
      "EduCore Admissions"
    ].join("\n"),
    html: [
      `<p>Hello ${safeName},</p>`,
      `<p>Thank you for applying for <strong>${safeCourse}</strong>.</p>`,
      "<p>We are sorry, but your application has not been accepted at this time. You may apply again in a future intake.</p>",
      "<p>EduCore Admissions</p>"
    ].join("")
  });
}

function emailUpdate(result: MailResult) {
  const now = new Date();
  return {
    decisionEmailSentAt: now,
    lastEmailStatus: result.status,
    lastEmailError: ""
  };
}

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
    const application = await CourseApplication.findById(req.params.id);
    if (!application) {
      throw new HttpError(404, "Application not found");
    }

    const update: Record<string, unknown> = {};
    if (req.body.status) update.status = req.body.status;
    if (typeof req.body.notes === "string") update.notes = req.body.notes;
    if (req.body.status && req.body.status !== "pending") {
      update.reviewedBy = req.user!.id;
      update.reviewedAt = new Date();
    }

    try {
      if (req.body.status === "accepted") {
        const account = await createOrResetStudentLogin(application);
        const mail = await sendAcceptedEmail(application, account.password);
        Object.assign(update, emailUpdate(mail), {
          studentUserId: account.userId,
          credentialsSentAt: new Date()
        });
      }

      if (req.body.status === "rejected") {
        const mail = await sendRejectedEmail(application);
        Object.assign(update, emailUpdate(mail));
      }
    } catch (error) {
      application.set({
        lastEmailStatus: "failed",
        lastEmailError: error instanceof Error ? error.message : "Email delivery failed"
      });
      await application.save();
      throw error;
    }

    application.set(update);
    await application.save();
    res.json(application);
  })
);
