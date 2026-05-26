import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { ActivityLog, Certificate, CertificateTemplate, Notification } from "../../database/mongo.models.js";
import { rows } from "../../database/mysql.js";
import { authorize } from "../../middleware/authorize.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { getIo } from "../../realtime/socket.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { HttpError } from "../../utils/http-error.js";

export const gradebookRoutes = Router();

const certificateCreateSchema = z.object({
  body: z.object({
    studentId: z.string().uuid(),
    classId: z.string().uuid()
  })
});

const certificateParamsSchema = z.object({
  params: z.object({ id: z.string() })
});

const templateElementSchema = z.object({
  id: z.string().min(1).max(80),
  kind: z.enum(["title", "subtitle", "student", "course", "date", "code", "grade", "signature", "custom"]),
  label: z.string().max(80).optional(),
  text: z.string().max(300).optional(),
  x: z.coerce.number().min(0).max(100),
  y: z.coerce.number().min(0).max(100),
  width: z.coerce.number().min(5).max(100),
  fontSize: z.coerce.number().min(10).max(72),
  fontFamily: z.string().max(80).default("Georgia, serif"),
  color: z.string().max(30).default("#111827"),
  align: z.enum(["left", "center", "right"]).default("center"),
  weight: z.enum(["normal", "semibold", "bold"]).default("normal"),
  italic: z.boolean().default(false)
});

const certificateTemplateSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(120),
    page: z.object({
      background: z.string().max(30).default("#fbfaf7"),
      borderColor: z.string().max(30).default("#1f2937"),
      accentColor: z.string().max(30).default("#0f766e"),
      paper: z.enum(["landscape", "portrait"]).default("landscape")
    }),
    elements: z.array(templateElementSchema).min(1).max(20)
  })
});

const defaultTemplate = {
  name: "Classic Academic Certificate",
  page: {
    background: "#fbfaf7",
    borderColor: "#1f2937",
    accentColor: "#0f766e",
    paper: "landscape"
  },
  elements: [
    { id: "title", kind: "title", text: "Certificate of Completion", x: 12, y: 13, width: 76, fontSize: 40, fontFamily: "Georgia, serif", color: "#111827", align: "center", weight: "bold", italic: false },
    { id: "subtitle", kind: "subtitle", text: "This certificate is proudly presented to", x: 18, y: 29, width: 64, fontSize: 16, fontFamily: "Inter, sans-serif", color: "#475569", align: "center", weight: "normal", italic: false },
    { id: "student", kind: "student", x: 14, y: 37, width: 72, fontSize: 34, fontFamily: "Georgia, serif", color: "#0f172a", align: "center", weight: "bold", italic: false },
    { id: "course", kind: "course", text: "for successfully completing {{courseTitle}}", x: 18, y: 51, width: 64, fontSize: 18, fontFamily: "Inter, sans-serif", color: "#334155", align: "center", weight: "normal", italic: false },
    { id: "instructor", kind: "custom", text: "Instructor: {{instructorName}}", x: 18, y: 60, width: 64, fontSize: 15, fontFamily: "Inter, sans-serif", color: "#475569", align: "center", weight: "normal", italic: false },
    { id: "date", kind: "date", text: "Issued {{issuedAt}}", x: 12, y: 74, width: 30, fontSize: 14, fontFamily: "Inter, sans-serif", color: "#334155", align: "left", weight: "normal", italic: false },
    { id: "code", kind: "code", text: "Verification {{verificationCode}}", x: 58, y: 74, width: 30, fontSize: 14, fontFamily: "Inter, sans-serif", color: "#334155", align: "right", weight: "normal", italic: false },
    { id: "signature", kind: "signature", text: "EduCore Admissions", x: 34, y: 79, width: 32, fontSize: 16, fontFamily: "Georgia, serif", color: "#111827", align: "center", weight: "semibold", italic: true }
  ]
};

const defaultInstructorElement = defaultTemplate.elements.find((element) => element.id === "instructor")!;

function templateWithInstructorElement<T extends { elements?: unknown[] }>(template: T) {
  const elements = Array.isArray(template.elements) ? template.elements : [];
  const hasInstructorElement = elements.some((element) => {
    if (!element || typeof element !== "object") return false;
    const candidate = element as { id?: unknown; text?: unknown };
    return candidate.id === "instructor" || (typeof candidate.text === "string" && candidate.text.includes("{{instructorName}}"));
  });

  return hasInstructorElement ? { ...template, elements } : { ...template, elements: [...elements, defaultInstructorElement] };
}

function verificationCode() {
  return `EDU-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

async function uniqueVerificationCode() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = verificationCode();
    const existing = await Certificate.findOne({ verificationCode: code });
    if (!existing) return code;
  }
  throw new HttpError(500, "Could not generate certificate code");
}

async function currentCertificateTemplate() {
  const template = await CertificateTemplate.findOne({}).sort({ updatedAt: -1 }).lean();
  return templateWithInstructorElement(template ?? defaultTemplate);
}

async function assertClassAccessible(user: Express.UserClaims, classId: string) {
  const [classRecord] = await rows<{
    classId: string;
    courseId: string;
    courseTitle: string;
    instructorName: string;
    room: string;
    instructorUserId: string;
  }>(
    `SELECT classes.id AS classId, classes.course_id AS courseId, courses.title AS courseTitle,
            instructor_users.full_name AS instructorName, classes.room, instructors.user_id AS instructorUserId
     FROM classes
     JOIN courses ON courses.id = classes.course_id
     JOIN instructors ON instructors.id = courses.instructor_id
     JOIN users instructor_users ON instructor_users.id = instructors.user_id
     WHERE classes.id = :classId`,
    { classId }
  );

  if (!classRecord) throw new HttpError(404, "Class not found");
  if (user.role !== "admin" && classRecord.instructorUserId !== user.id) {
    throw new HttpError(403, "You can only manage certificates for your own classes");
  }

  return classRecord;
}

async function gradebookRows(user: Express.UserClaims, classId?: string) {
  const classFilter = classId ? "AND classes.id = :classId" : "";
  const instructorFilter = user.role === "instructor" ? "AND instructors.user_id = :userId" : "";
  const studentFilter = user.role === "student" ? "AND students.user_id = :userId" : "";

  return rows<{
    studentId: string;
    studentUserId: string;
    studentName: string;
    email: string;
    classId: string;
    courseId: string;
    courseTitle: string;
    room: string;
    totalAssignments: number;
    submittedAssignments: number;
    gradedSubmissions: number;
    averageGrade: number | null;
  }>(
    `SELECT students.id AS studentId, students.user_id AS studentUserId, users.full_name AS studentName,
            users.email, classes.id AS classId, classes.course_id AS courseId, courses.title AS courseTitle,
            instructor_users.full_name AS instructorName, classes.room,
            COUNT(DISTINCT assignments.id) AS totalAssignments,
            COUNT(DISTINCT submissions.id) AS submittedAssignments,
            COUNT(DISTINCT CASE WHEN submissions.grade IS NOT NULL THEN submissions.id END) AS gradedSubmissions,
            ROUND(AVG(submissions.grade), 2) AS averageGrade
     FROM enrollments
     JOIN students ON students.id = enrollments.student_id
     JOIN users ON users.id = students.user_id
     JOIN classes ON classes.id = enrollments.class_id
     JOIN courses ON courses.id = classes.course_id
     JOIN instructors ON instructors.id = courses.instructor_id
     JOIN users instructor_users ON instructor_users.id = instructors.user_id
     LEFT JOIN assignments ON assignments.course_id = courses.id
       AND (assignments.class_id IS NULL OR assignments.class_id = classes.id)
     LEFT JOIN submissions ON submissions.assignment_id = assignments.id AND submissions.student_id = students.id
     WHERE enrollments.status = 'active'
       ${classFilter}
       ${instructorFilter}
       ${studentFilter}
     GROUP BY students.id, students.user_id, users.full_name, users.email, classes.id,
              classes.course_id, courses.title, instructor_users.full_name, classes.room
     ORDER BY courses.title, classes.room, users.full_name`,
    { classId, userId: user.id }
  );
}

gradebookRoutes.get(
  "/",
  authorize("admin", "instructor", "student"),
  asyncHandler(async (req, res) => {
    const classId = String(req.query.classId ?? "") || undefined;
    const data = await gradebookRows(req.user!, classId);
    res.json({
      data: data.map((row) => ({
        ...row,
        totalAssignments: Number(row.totalAssignments ?? 0),
        submittedAssignments: Number(row.submittedAssignments ?? 0),
        gradedSubmissions: Number(row.gradedSubmissions ?? 0),
        averageGrade: row.averageGrade === null ? null : Number(row.averageGrade),
        certificateEligible:
          Number(row.totalAssignments ?? 0) === 0 ||
          (Number(row.gradedSubmissions ?? 0) >= Number(row.totalAssignments ?? 0) && Number(row.averageGrade ?? 0) >= 60)
      }))
    });
  })
);

gradebookRoutes.get(
  "/certificates",
  authorize("admin", "instructor", "student"),
  asyncHandler(async (req, res) => {
    if (req.user!.role === "student") {
      const data = await Certificate.find({ studentUserId: req.user!.id }).sort({ issuedAt: -1 }).lean();
      res.json({ data });
      return;
    }

    if (req.user!.role === "admin") {
      const data = await Certificate.find({}).sort({ issuedAt: -1 }).limit(300).lean();
      res.json({ data });
      return;
    }

    const classes = await rows<{ classId: string }>(
      `SELECT classes.id AS classId
       FROM classes
       JOIN courses ON courses.id = classes.course_id
       JOIN instructors ON instructors.id = courses.instructor_id
       WHERE instructors.user_id = :userId`,
      { userId: req.user!.id }
    );
    const data = await Certificate.find({ classId: { $in: classes.map((item) => item.classId) } }).sort({ issuedAt: -1 }).lean();
    res.json({ data });
  })
);

gradebookRoutes.get(
  "/certificate-template",
  authorize("admin", "instructor", "student"),
  asyncHandler(async (_req, res) => {
    res.json(await currentCertificateTemplate());
  })
);

gradebookRoutes.put(
  "/certificate-template",
  authorize("admin"),
  validate(certificateTemplateSchema),
  asyncHandler(async (req, res) => {
    const template = await CertificateTemplate.findOneAndUpdate(
      {},
      {
        name: req.body.name,
        page: req.body.page,
        elements: req.body.elements,
        updatedBy: req.user!.id
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    await ActivityLog.create({
      userId: req.user!.id,
      action: "certificate_template_updated",
      entity: "certificate_template",
      entityId: String(template._id),
      metadata: { name: req.body.name }
    });
    res.json(template);
  })
);

gradebookRoutes.post(
  "/certificates",
  authorize("admin", "instructor"),
  validate(certificateCreateSchema),
  asyncHandler(async (req, res) => {
    const classRecord = await assertClassAccessible(req.user!, req.body.classId);
    const [row] = await gradebookRows(req.user!, req.body.classId).then((items) =>
      items.filter((item) => item.studentId === req.body.studentId)
    );
    if (!row) throw new HttpError(404, "Enrolled student not found for this class");

    const totalAssignments = Number(row.totalAssignments ?? 0);
    const gradedSubmissions = Number(row.gradedSubmissions ?? 0);
    const averageGrade = row.averageGrade === null ? null : Number(row.averageGrade);
    if (totalAssignments > 0 && (gradedSubmissions < totalAssignments || Number(averageGrade ?? 0) < 60)) {
      throw new HttpError(422, "Certificate requires all assignments graded and an average grade of at least 60");
    }

    const existing = await Certificate.findOne({
      studentId: req.body.studentId,
      classId: req.body.classId,
      status: "issued"
    });
    if (existing) {
      res.json(existing);
      return;
    }

    const template = await currentCertificateTemplate();
    const certificate = await Certificate.create({
      studentId: row.studentId,
      studentUserId: row.studentUserId,
      studentName: row.studentName,
      classId: row.classId,
      courseId: classRecord.courseId,
      courseTitle: classRecord.courseTitle,
      classRoom: classRecord.room,
      instructorName: classRecord.instructorName,
      finalGrade: averageGrade,
      verificationCode: await uniqueVerificationCode(),
      issuedBy: req.user!.id,
      templateSnapshot: template,
      metadata: { totalAssignments, gradedSubmissions }
    });

    await ActivityLog.create({
      userId: req.user!.id,
      action: "certificate_issued",
      entity: "certificate",
      entityId: String(certificate._id),
      metadata: { studentId: row.studentId, classId: row.classId, courseId: row.courseId }
    });

    const notification = await Notification.create({
      userId: row.studentUserId,
      title: "Certificate issued",
      message: `Your certificate for ${row.courseTitle} is available.`,
      type: "certificate",
      metadata: { certificateId: certificate._id, verificationCode: certificate.verificationCode }
    });
    getIo()?.to(`user:${row.studentUserId}`).emit("notification:new", notification);

    res.status(201).json(certificate);
  })
);

gradebookRoutes.patch(
  "/certificates/:id/revoke",
  authorize("admin"),
  validate(certificateParamsSchema),
  asyncHandler(async (req, res) => {
    const certificate = await Certificate.findByIdAndUpdate(
      req.params.id,
      { status: "revoked", revokedBy: req.user!.id, revokedAt: new Date() },
      { new: true }
    );
    if (!certificate) throw new HttpError(404, "Certificate not found");
    await ActivityLog.create({
      userId: req.user!.id,
      action: "certificate_revoked",
      entity: "certificate",
      entityId: req.params.id,
      metadata: { studentId: certificate.studentId, classId: certificate.classId }
    });
    res.json(certificate);
  })
);
