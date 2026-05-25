import { Router } from "express";
import { z } from "zod";
import { ActivityLog, Notification, StudentDocument } from "../../database/mongo.models.js";
import { rows } from "../../database/mysql.js";
import { authorize } from "../../middleware/authorize.middleware.js";
import { upload } from "../../middleware/upload.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { getIo } from "../../realtime/socket.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { HttpError } from "../../utils/http-error.js";

export const documentRoutes = Router();

const reviewDocumentSchema = z.object({
  params: z.object({ id: z.string() }),
  body: z.object({
    status: z.enum(["approved", "rejected"]),
    notes: z.string().max(1200).optional().default("")
  })
});

async function studentForUser(userId: string) {
  const [student] = await rows<{ id: string; userId: string; fullName: string }>(
    `SELECT students.id, students.user_id AS userId, users.full_name AS fullName
     FROM students
     JOIN users ON users.id = students.user_id
     WHERE users.id = :userId`,
    { userId }
  );
  if (!student) throw new HttpError(403, "Student profile not found");
  return student;
}

async function studentById(studentId: string) {
  const [student] = await rows<{ id: string; userId: string; fullName: string }>(
    `SELECT students.id, students.user_id AS userId, users.full_name AS fullName
     FROM students
     JOIN users ON users.id = students.user_id
     WHERE students.id = :studentId`,
    { studentId }
  );
  if (!student) throw new HttpError(404, "Student not found");
  return student;
}

documentRoutes.get(
  "/",
  asyncHandler(async (req, res) => {
    const status = String(req.query.status ?? "");
    const query: Record<string, unknown> = {};
    if (status) query.status = status;

    if (req.user!.role === "student") {
      const student = await studentForUser(req.user!.id);
      query.studentId = student.id;
    } else if (req.user!.role !== "admin") {
      throw new HttpError(403, "Only admins and students can view documents");
    }

    const data = await StudentDocument.find(query).sort({ createdAt: -1 }).limit(300).lean();
    res.json({ data });
  })
);

documentRoutes.post(
  "/",
  authorize("admin", "student"),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({
        title: z.string().min(2).max(160),
        type: z.string().min(2).max(80),
        studentId: z.string().uuid().optional()
      })
      .parse(req.body);

    const student = req.user!.role === "student" ? await studentForUser(req.user!.id) : await studentById(String(parsed.studentId ?? ""));
    if (!req.file) throw new HttpError(422, "Document file is required");

    const document = await StudentDocument.create({
      studentId: student.id,
      userId: student.userId,
      fullName: student.fullName,
      title: parsed.title,
      type: parsed.type,
      fileUrl: `/uploads/${req.file.filename}`,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size
    });

    await ActivityLog.create({
      userId: req.user!.id,
      action: "student_document_uploaded",
      entity: "student_document",
      entityId: String(document._id),
      metadata: { studentId: student.id, type: parsed.type }
    });

    const notification = await Notification.create({
      role: "admin",
      title: "Document pending review",
      message: `${student.fullName} uploaded ${parsed.title}.`,
      type: "document",
      metadata: { documentId: document._id, studentId: student.id }
    });
    getIo()?.to("role:admin").emit("notification:new", notification);

    res.status(201).json(document);
  })
);

documentRoutes.patch(
  "/:id/review",
  authorize("admin"),
  validate(reviewDocumentSchema),
  asyncHandler(async (req, res) => {
    const document = await StudentDocument.findByIdAndUpdate(
      req.params.id,
      {
        status: req.body.status,
        notes: req.body.notes,
        reviewedBy: req.user!.id,
        reviewedAt: new Date()
      },
      { new: true }
    );
    if (!document) throw new HttpError(404, "Document not found");

    await ActivityLog.create({
      userId: req.user!.id,
      action: `student_document_${req.body.status}`,
      entity: "student_document",
      entityId: req.params.id,
      metadata: { studentId: document.studentId, notes: req.body.notes }
    });

    const notification = await Notification.create({
      userId: document.userId,
      title: req.body.status === "approved" ? "Document approved" : "Document rejected",
      message:
        req.body.status === "approved"
          ? `${document.title} has been approved.`
          : `${document.title} was rejected${req.body.notes ? `: ${req.body.notes}` : "."}`,
      type: "document",
      metadata: { documentId: document._id, status: req.body.status }
    });
    getIo()?.to(`user:${document.userId}`).emit("notification:new", notification);

    res.json(document);
  })
);
