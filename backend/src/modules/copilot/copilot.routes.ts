import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ActivityLog, CopilotDocument, CopilotDraft, CopilotMessage, CopilotThread } from "../../database/mongo.models.js";
import { authorize } from "../../middleware/authorize.middleware.js";
import { upload } from "../../middleware/upload.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { HttpError } from "../../utils/http-error.js";
import { answerWithCopilot, buildCopilotContext, type CopilotMode } from "./copilot.service.js";

export const copilotRoutes = Router();

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/);
const modeSchema = z.enum(["ask", "tutor", "draft", "admin", "instructor"]);

const chatSchema = z.object({
  body: z.object({
    message: z.string().min(2).max(4000),
    mode: modeSchema.default("ask"),
    threadId: objectId.optional()
  })
});

const draftSchema = z.object({
  body: z.object({
    type: z.enum(["student_message", "lesson", "assignment", "rubric", "feedback", "admin_intervention", "policy", "note"]),
    title: z.string().min(2).max(180),
    content: z.string().min(2).max(10000),
    targetRole: z.enum(["admin", "instructor", "student"]).optional(),
    targetUserId: z.string().uuid().optional(),
    targetEntity: z.string().max(80).optional(),
    targetEntityId: z.string().max(120).optional(),
    metadata: z.record(z.unknown()).optional().default({})
  })
});

const draftStatusSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({
    status: z.enum(["approved", "rejected"])
  })
});

const documentBodySchema = z.object({
  title: z.string().min(2).max(180),
  visibility: z.enum(["all", "role", "private"]).default("role"),
  targetRole: z.enum(["admin", "instructor", "student"]).optional()
});

function titleFromMessage(message: string) {
  const title = message.replace(/\s+/g, " ").trim();
  return title.length > 70 ? `${title.slice(0, 67)}...` : title;
}

async function extractDocumentText(file: Express.Multer.File) {
  const extension = path.extname(file.originalname).toLowerCase();
  const textLike = file.mimetype.startsWith("text/") || [".txt", ".md", ".csv", ".json", ".log"].includes(extension);
  if (!textLike) return { extractedText: "", status: "metadata_only" as const };
  const content = await fs.readFile(file.path, "utf8");
  return { extractedText: content.slice(0, 80_000), status: "ready" as const };
}

async function getOwnedThread(threadId: string, user: Express.UserClaims) {
  const thread = await CopilotThread.findById(threadId);
  if (!thread) throw new HttpError(404, "Copilot thread not found");
  if (String(thread.userId) !== user.id) throw new HttpError(403, "You can only open your own Copilot threads");
  return thread;
}

copilotRoutes.get(
  "/context",
  asyncHandler(async (req, res) => {
    const mode = modeSchema.catch("ask").parse(req.query.mode);
    const query = String(req.query.q ?? "");
    res.json({ context: await buildCopilotContext(req.user!, mode, query) });
  })
);

copilotRoutes.get(
  "/threads",
  asyncHandler(async (req, res) => {
    const data = await CopilotThread.find({ userId: req.user!.id, archivedAt: null }).sort({ lastMessageAt: -1 }).limit(30).lean();
    res.json({ data });
  })
);

copilotRoutes.get(
  "/threads/:id/messages",
  validate(z.object({ params: z.object({ id: objectId }) })),
  asyncHandler(async (req, res) => {
    await getOwnedThread(String(req.params.id), req.user!);
    const data = await CopilotMessage.find({ threadId: req.params.id }).sort({ createdAt: 1 }).limit(100).lean();
    res.json({ data });
  })
);

copilotRoutes.post(
  "/chat",
  validate(chatSchema),
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const mode = req.body.mode as CopilotMode;
    const thread = req.body.threadId
      ? await getOwnedThread(req.body.threadId, user)
      : await CopilotThread.create({
          userId: user.id,
          role: user.role,
          mode,
          title: titleFromMessage(req.body.message),
          lastMessageAt: new Date()
        });

    const context = await buildCopilotContext(user, mode, req.body.message);
    const answer = await answerWithCopilot(user, req.body.message, context);

    const [userMessage, assistantMessage] = await Promise.all([
      CopilotMessage.create({
        threadId: thread._id,
        userId: user.id,
        role: "user",
        content: req.body.message,
        provider: "user",
        metadata: { mode }
      }),
      CopilotMessage.create({
        threadId: thread._id,
        userId: user.id,
        role: "assistant",
        content: answer.content,
        provider: answer.provider,
        citations: answer.citations,
        actions: answer.actions,
        metadata: answer.metadata
      })
    ]);

    thread.mode = mode;
    thread.lastMessageAt = new Date();
    await thread.save();

    await ActivityLog.create({
      userId: user.id,
      action: "copilot_chat",
      entity: "copilot-thread",
      entityId: String(thread._id),
      metadata: {
        mode,
        provider: answer.provider,
        citations: answer.citations.length
      }
    });

    res.status(201).json({
      thread,
      messages: [userMessage, assistantMessage],
      context: {
        summary: context.summary,
        metrics: context.metrics,
        suggestions: context.suggestions
      }
    });
  })
);

copilotRoutes.get(
  "/drafts",
  asyncHandler(async (req, res) => {
    const query = req.user!.role === "admin" ? {} : { createdBy: req.user!.id };
    const data = await CopilotDraft.find(query).sort({ createdAt: -1 }).limit(100).lean();
    res.json({ data });
  })
);

copilotRoutes.post(
  "/drafts",
  validate(draftSchema),
  asyncHandler(async (req, res) => {
    const draft = await CopilotDraft.create({
      ...req.body,
      createdBy: req.user!.id,
      status: "pending"
    });
    await ActivityLog.create({
      userId: req.user!.id,
      action: "copilot_draft_created",
      entity: "copilot-draft",
      entityId: String(draft._id),
      metadata: { type: draft.type, title: draft.title }
    });
    res.status(201).json(draft);
  })
);

copilotRoutes.patch(
  "/drafts/:id/status",
  validate(draftStatusSchema),
  asyncHandler(async (req, res) => {
    const draft = await CopilotDraft.findById(req.params.id);
    if (!draft) throw new HttpError(404, "Copilot draft not found");
    if (req.user!.role !== "admin" && String(draft.createdBy) !== req.user!.id) {
      throw new HttpError(403, "You can only approve or reject your own drafts");
    }

    draft.status = req.body.status;
    draft.approvedBy = req.user!.id;
    draft.approvedAt = req.body.status === "approved" ? new Date() : null;
    draft.rejectedAt = req.body.status === "rejected" ? new Date() : null;
    await draft.save();

    await ActivityLog.create({
      userId: req.user!.id,
      action: req.body.status === "approved" ? "copilot_draft_approved" : "copilot_draft_rejected",
      entity: "copilot-draft",
      entityId: String(draft._id),
      metadata: { type: draft.type, title: draft.title }
    });

    res.json(draft);
  })
);

copilotRoutes.get(
  "/documents",
  asyncHandler(async (req, res) => {
    const query =
      req.user!.role === "admin"
        ? {}
        : {
            $or: [{ visibility: "all" }, { targetRole: req.user!.role }, { uploadedBy: req.user!.id }]
          };
    const data = await CopilotDocument.find(query).sort({ createdAt: -1 }).limit(100).lean();
    res.json({ data });
  })
);

copilotRoutes.post(
  "/documents",
  authorize("admin", "instructor"),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(422, "Document file is required");
    const parsed = documentBodySchema.parse({
      title: req.body.title,
      visibility: req.body.visibility || "role",
      targetRole: req.body.targetRole || req.user!.role
    });

    if (req.user!.role === "instructor" && parsed.targetRole === "admin") {
      throw new HttpError(403, "Instructors cannot publish Copilot documents to admins");
    }

    const extraction = await extractDocumentText(req.file);
    const document = await CopilotDocument.create({
      uploadedBy: req.user!.id,
      title: parsed.title,
      visibility: parsed.visibility,
      targetRole: parsed.visibility === "role" ? parsed.targetRole : undefined,
      fileUrl: `/uploads/${req.file.filename}`,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      extractedText: extraction.extractedText,
      status: extraction.status
    });

    await ActivityLog.create({
      userId: req.user!.id,
      action: "copilot_document_uploaded",
      entity: "copilot-document",
      entityId: String(document._id),
      metadata: { title: document.title, status: document.status, mimeType: document.mimeType }
    });

    res.status(201).json(document);
  })
);

copilotRoutes.get(
  "/audit",
  authorize("admin"),
  asyncHandler(async (_req, res) => {
    const [messages, drafts] = await Promise.all([
      CopilotMessage.find({}).sort({ createdAt: -1 }).limit(50).lean(),
      CopilotDraft.find({}).sort({ createdAt: -1 }).limit(50).lean()
    ]);
    res.json({ messages, drafts });
  })
);
