import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { env } from "../../config/env.js";
import { ActivityLog, CourseApplication, EmailLog, Notification } from "../../database/mongo.models.js";
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
    status: z.enum(["pending", "reviewed", "accepted", "rejected", "enrolled"]).optional(),
    stage: z.enum(["new", "under_review", "interview", "accepted", "rejected", "enrolled"]).optional(),
    notes: z.string().max(1200).optional(),
    interviewAt: z.string().datetime().optional().or(z.literal(""))
  })
});

const applicationEnrollmentSchema = z.object({
  params: z.object({ id: z.string() }),
  body: z.object({
    classId: z.string().uuid()
  })
});

function legacyStage(status?: string) {
  if (status === "reviewed") return "under_review";
  if (status === "accepted") return "accepted";
  if (status === "rejected") return "rejected";
  if (status === "enrolled") return "enrolled";
  return "new";
}

function statusForStage(stage: string) {
  if (stage === "under_review" || stage === "interview") return "reviewed";
  if (stage === "accepted") return "accepted";
  if (stage === "rejected") return "rejected";
  if (stage === "enrolled") return "enrolled";
  return "pending";
}

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

  return { userId, email, password, studentCode: studentInsert?.studentCode, studentId: student?.id ?? studentInsert!.id };
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

async function logEmail(input: {
  to: string;
  subject: string;
  category: string;
  result: MailResult;
  applicationId: string;
  sentBy?: string;
  metadata?: Record<string, unknown>;
}) {
  await EmailLog.create({
    to: input.to,
    subject: input.subject,
    category: input.category,
    status: input.result.status,
    providerMessageId: input.result.messageId,
    relatedEntity: "course_application",
    relatedEntityId: input.applicationId,
    sentBy: input.sentBy,
    metadata: input.metadata ?? {}
  });
}

async function getClassEnrollmentTarget(classId: string) {
  const [classRecord] = await rows<{
    classId: string;
    courseId: string;
    courseTitle: string;
    room: string;
    instructorUserId: string;
  }>(
    `SELECT classes.id AS classId, classes.course_id AS courseId, courses.title AS courseTitle,
            classes.room, instructors.user_id AS instructorUserId
     FROM classes
     JOIN courses ON courses.id = classes.course_id
     JOIN instructors ON instructors.id = courses.instructor_id
     WHERE classes.id = :classId`,
    { classId }
  );

  if (!classRecord) throw new HttpError(404, "Class not found");
  return classRecord;
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
      message: req.body.message,
      stage: "new",
      status: "pending"
    });

    const notification = await Notification.create({
      role: "admin",
      title: "New course application",
      message: `${application.fullName} applied for ${application.courseTitle}.`,
      type: "application",
      metadata: { applicationId: application._id }
    });
    getIo()?.to("role:admin").emit("notification:new", notification);
    await ActivityLog.create({
      action: "course_application_submitted",
      entity: "course_application",
      entityId: String(application._id),
      metadata: { courseId: req.body.courseId, courseTitle, email: application.email }
    });

    res.status(201).json(application);
  })
);

applicationRoutes.get(
  "/",
  authorize("admin"),
  asyncHandler(async (req, res) => {
    const stage = String(req.query.stage ?? "");
    const status = String(req.query.status ?? "");
    const query = stage ? { stage } : status ? { status } : {};
    const data = (await CourseApplication.find(query).sort({ createdAt: -1 }).limit(200).lean()).map((application) => ({
      ...application,
      stage: application.stage ?? legacyStage(application.status)
    }));
    res.json({ data });
  })
);

applicationRoutes.get(
  "/:id/timeline",
  authorize("admin"),
  validate(z.object({ params: z.object({ id: z.string() }) })),
  asyncHandler(async (req, res) => {
    const [emails, audit] = await Promise.all([
      EmailLog.find({ relatedEntity: "course_application", relatedEntityId: req.params.id }).sort({ createdAt: -1 }).lean(),
      ActivityLog.find({ entity: "course_application", entityId: req.params.id }).sort({ createdAt: -1 }).limit(50).lean()
    ]);
    res.json({ emails, audit });
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

    const currentStage = String(application.stage ?? legacyStage(String(application.status)));
    const requestedStage = req.body.stage ?? (req.body.status ? legacyStage(req.body.status) : undefined);
    const update: Record<string, unknown> = {};
    if (requestedStage) {
      update.stage = requestedStage;
      update.status = statusForStage(requestedStage);
    } else if (req.body.status) {
      update.status = req.body.status;
    }
    if (typeof req.body.notes === "string") update.notes = req.body.notes;
    if (typeof req.body.interviewAt === "string") update.interviewAt = req.body.interviewAt ? new Date(req.body.interviewAt) : null;
    if (requestedStage && requestedStage !== "new") {
      update.reviewedBy = req.user!.id;
      update.reviewedAt = new Date();
    }

    try {
      if (requestedStage === "accepted" && !application.credentialsSentAt) {
        const account = await createOrResetStudentLogin(application);
        const mail = await sendAcceptedEmail(application, account.password);
        Object.assign(update, emailUpdate(mail), {
          studentUserId: account.userId,
          studentId: account.studentId,
          credentialsSentAt: new Date()
        });
        await logEmail({
          to: application.email,
          subject: `EduCore application accepted: ${application.courseTitle}`,
          category: "application_accepted",
          result: mail,
          applicationId: String(req.params.id),
          sentBy: req.user!.id,
          metadata: { studentUserId: account.userId, studentId: account.studentId }
        });
      }

      if (requestedStage === "rejected" && currentStage !== "rejected") {
        const mail = await sendRejectedEmail(application);
        Object.assign(update, emailUpdate(mail));
        await logEmail({
          to: application.email,
          subject: `EduCore application update: ${application.courseTitle}`,
          category: "application_rejected",
          result: mail,
          applicationId: String(req.params.id),
          sentBy: req.user!.id
        });
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
    await ActivityLog.create({
      userId: req.user!.id,
      action: requestedStage ? "course_application_stage_changed" : "course_application_updated",
      entity: "course_application",
      entityId: req.params.id,
      metadata: { from: currentStage, to: requestedStage ?? currentStage, notesChanged: typeof req.body.notes === "string" }
    });
    res.json(application);
  })
);

applicationRoutes.post(
  "/:id/enroll",
  authorize("admin"),
  validate(applicationEnrollmentSchema),
  asyncHandler(async (req, res) => {
    const application = await CourseApplication.findById(req.params.id);
    if (!application) throw new HttpError(404, "Application not found");

    const stage = String(application.stage ?? legacyStage(String(application.status)));
    if (stage !== "accepted" && stage !== "enrolled") {
      throw new HttpError(422, "Only accepted applications can be enrolled");
    }

    const studentId = String(application.studentId ?? "");
    const studentUserId = String(application.studentUserId ?? "");
    if (!studentId || !studentUserId) {
      throw new HttpError(422, "Accept the application before enrolling the student");
    }

    const classRecord = await getClassEnrollmentTarget(req.body.classId);
    await withTransaction(async (connection) => {
      await connection.execute(
        `INSERT INTO enrollments (id, student_id, class_id, status)
         VALUES (:id, :studentId, :classId, 'active')
         ON DUPLICATE KEY UPDATE status = 'active'`,
        { id: uuid(), studentId, classId: req.body.classId }
      );
    });

    application.set({
      stage: "enrolled",
      status: "enrolled",
      enrolledClassId: req.body.classId,
      enrolledAt: new Date(),
      reviewedBy: req.user!.id,
      reviewedAt: new Date()
    });
    await application.save();

    const notification = await Notification.create({
      userId: studentUserId,
      title: "Course enrollment confirmed",
      message: `You have been enrolled in ${classRecord.courseTitle} / ${classRecord.room}.`,
      type: "enrollment",
      metadata: { classId: req.body.classId, courseId: classRecord.courseId, applicationId: req.params.id }
    });
    getIo()?.to(`user:${studentUserId}`).emit("notification:new", notification);

    await ActivityLog.create({
      userId: req.user!.id,
      action: "course_application_enrolled",
      entity: "course_application",
      entityId: req.params.id,
      metadata: { studentId, classId: req.body.classId, courseId: classRecord.courseId }
    });

    res.json(application);
  })
);
