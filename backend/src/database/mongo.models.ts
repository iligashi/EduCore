import { Schema, model } from "mongoose";

const commonOptions = {
  timestamps: true,
  versionKey: false
} as const;

export const Lesson = model(
  "Lesson",
  new Schema(
    {
      courseId: { type: String, required: true, index: true },
      title: { type: String, required: true },
      content: { type: String, required: true },
      blocks: { type: [Schema.Types.Mixed], default: [] },
      assets: { type: [String], default: [] },
      order: { type: Number, default: 0 },
      published: { type: Boolean, default: false }
    },
    commonOptions
  )
);

export const ClassDay = model(
  "ClassDay",
  new Schema(
    {
      classId: { type: String, required: true, index: true },
      courseId: { type: String, required: true, index: true },
      dayNumber: { type: Number, required: true },
      title: { type: String, required: true },
      content: { type: String, default: "" },
      blocks: { type: [Schema.Types.Mixed], default: [] },
      assets: { type: [String], default: [] },
      published: { type: Boolean, default: false },
      updatedBy: { type: String }
    },
    commonOptions
  )
);

ClassDay.schema.index({ classId: 1, dayNumber: 1 }, { unique: true });

export const ClassBackup = model(
  "ClassBackup",
  new Schema(
    {
      classId: { type: String, required: true, index: true },
      title: { type: String, required: true },
      days: { type: [Schema.Types.Mixed], default: [] },
      createdBy: { type: String, required: true }
    },
    commonOptions
  )
);

export const ClassComment = model(
  "ClassComment",
  new Schema(
    {
      classId: { type: String, required: true, index: true },
      message: { type: String, required: true },
      authorId: { type: String, required: true, index: true },
      authorName: { type: String, required: true },
      authorRole: { type: String, enum: ["admin", "instructor"], required: true },
      parentId: { type: Schema.Types.ObjectId, ref: "ClassComment", default: null, index: true }
    },
    commonOptions
  )
);

export const Notification = model(
  "Notification",
  new Schema(
    {
      userId: { type: String, index: true },
      role: { type: String, enum: ["admin", "instructor", "student"], index: true },
      title: { type: String, required: true },
      message: { type: String, required: true },
      type: { type: String, default: "system" },
      metadata: { type: Schema.Types.Mixed, default: {} },
      readAt: { type: Date, default: null }
    },
    commonOptions
  )
);

export const ActivityLog = model(
  "ActivityLog",
  new Schema(
    {
      userId: { type: String, index: true },
      action: { type: String, required: true },
      entity: { type: String, required: true },
      entityId: { type: String },
      metadata: { type: Schema.Types.Mixed, default: {} }
    },
    commonOptions
  )
);

export const CourseApplication = model(
  "CourseApplication",
  new Schema(
    {
      fullName: { type: String, required: true },
      email: { type: String, required: true, index: true },
      phone: { type: String, default: "" },
      courseId: { type: String, index: true },
      courseTitle: { type: String, required: true },
      educationLevel: { type: String, default: "" },
      message: { type: String, default: "" },
      status: { type: String, enum: ["pending", "reviewed", "accepted", "rejected", "enrolled"], default: "pending", index: true },
      stage: {
        type: String,
        enum: ["new", "under_review", "interview", "accepted", "rejected", "enrolled"],
        default: "new",
        index: true
      },
      interviewAt: { type: Date, default: null },
      notes: { type: String, default: "" },
      studentUserId: { type: String },
      studentId: { type: String },
      credentialsSentAt: { type: Date, default: null },
      decisionEmailSentAt: { type: Date, default: null },
      lastEmailStatus: { type: String, enum: ["sent", "preview", "failed"], default: null },
      lastEmailError: { type: String, default: "" },
      enrolledClassId: { type: String },
      enrolledAt: { type: Date, default: null },
      reviewedBy: { type: String },
      reviewedAt: { type: Date, default: null }
    },
    commonOptions
  )
);

export const EmailLog = model(
  "EmailLog",
  new Schema(
    {
      to: { type: String, required: true, index: true },
      subject: { type: String, required: true },
      category: { type: String, required: true, index: true },
      status: { type: String, enum: ["sent", "preview", "failed"], required: true, index: true },
      providerMessageId: { type: String },
      error: { type: String, default: "" },
      relatedEntity: { type: String, index: true },
      relatedEntityId: { type: String, index: true },
      sentBy: { type: String, index: true },
      metadata: { type: Schema.Types.Mixed, default: {} }
    },
    commonOptions
  )
);

export const StudentDocument = model(
  "StudentDocument",
  new Schema(
    {
      studentId: { type: String, required: true, index: true },
      userId: { type: String, required: true, index: true },
      fullName: { type: String, required: true },
      title: { type: String, required: true },
      type: { type: String, required: true, index: true },
      fileUrl: { type: String, required: true },
      originalName: { type: String, required: true },
      mimeType: { type: String, required: true },
      size: { type: Number, default: 0 },
      status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
      notes: { type: String, default: "" },
      reviewedBy: { type: String },
      reviewedAt: { type: Date, default: null }
    },
    commonOptions
  )
);

export const Certificate = model(
  "Certificate",
  new Schema(
    {
      studentId: { type: String, required: true, index: true },
      studentUserId: { type: String, required: true, index: true },
      studentName: { type: String, required: true },
      classId: { type: String, required: true, index: true },
      courseId: { type: String, required: true, index: true },
      courseTitle: { type: String, required: true },
      classRoom: { type: String, default: "" },
      instructorName: { type: String, default: "" },
      finalGrade: { type: Number, default: null },
      verificationCode: { type: String, required: true, unique: true, index: true },
      status: { type: String, enum: ["issued", "revoked"], default: "issued", index: true },
      issuedBy: { type: String, required: true },
      issuedAt: { type: Date, default: Date.now },
      revokedBy: { type: String },
      revokedAt: { type: Date, default: null },
      templateSnapshot: { type: Schema.Types.Mixed, default: {} },
      metadata: { type: Schema.Types.Mixed, default: {} }
    },
    commonOptions
  )
);

export const CertificateTemplate = model(
  "CertificateTemplate",
  new Schema(
    {
      name: { type: String, required: true, default: "Default Certificate" },
      page: { type: Schema.Types.Mixed, default: {} },
      elements: { type: [Schema.Types.Mixed], default: [] },
      updatedBy: { type: String, required: true }
    },
    commonOptions
  )
);

export const CopilotThread = model(
  "CopilotThread",
  new Schema(
    {
      userId: { type: String, required: true, index: true },
      role: { type: String, enum: ["admin", "instructor", "student"], required: true, index: true },
      title: { type: String, required: true },
      mode: { type: String, default: "ask", index: true },
      lastMessageAt: { type: Date, default: Date.now },
      archivedAt: { type: Date, default: null }
    },
    commonOptions
  )
);

export const CopilotMessage = model(
  "CopilotMessage",
  new Schema(
    {
      threadId: { type: Schema.Types.ObjectId, ref: "CopilotThread", required: true, index: true },
      userId: { type: String, required: true, index: true },
      role: { type: String, enum: ["user", "assistant"], required: true },
      content: { type: String, required: true },
      provider: { type: String, default: "educore" },
      citations: { type: [Schema.Types.Mixed], default: [] },
      actions: { type: [Schema.Types.Mixed], default: [] },
      metadata: { type: Schema.Types.Mixed, default: {} }
    },
    commonOptions
  )
);

CopilotMessage.schema.index({ threadId: 1, createdAt: 1 });

export const CopilotDraft = model(
  "CopilotDraft",
  new Schema(
    {
      createdBy: { type: String, required: true, index: true },
      approvedBy: { type: String, index: true },
      type: {
        type: String,
        enum: ["student_message", "lesson", "assignment", "rubric", "feedback", "admin_intervention", "policy", "note"],
        required: true,
        index: true
      },
      title: { type: String, required: true },
      content: { type: String, required: true },
      status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
      targetRole: { type: String, enum: ["admin", "instructor", "student"] },
      targetUserId: { type: String },
      targetEntity: { type: String },
      targetEntityId: { type: String },
      metadata: { type: Schema.Types.Mixed, default: {} },
      approvedAt: { type: Date, default: null },
      rejectedAt: { type: Date, default: null }
    },
    commonOptions
  )
);

export const CopilotDocument = model(
  "CopilotDocument",
  new Schema(
    {
      uploadedBy: { type: String, required: true, index: true },
      title: { type: String, required: true },
      fileUrl: { type: String, required: true },
      originalName: { type: String, required: true },
      mimeType: { type: String, required: true },
      size: { type: Number, default: 0 },
      extractedText: { type: String, default: "" },
      visibility: { type: String, enum: ["all", "role", "private"], default: "role", index: true },
      targetRole: { type: String, enum: ["admin", "instructor", "student"], index: true },
      status: { type: String, enum: ["ready", "metadata_only"], default: "ready", index: true },
      metadata: { type: Schema.Types.Mixed, default: {} }
    },
    commonOptions
  )
);

export const Announcement = model(
  "Announcement",
  new Schema(
    {
      courseId: { type: String, index: true },
      title: { type: String, required: true },
      body: { type: String, required: true },
      audience: { type: String, enum: ["all", "admin", "instructor", "student"], default: "all" },
      publishedAt: { type: Date, default: Date.now }
    },
    commonOptions
  )
);

export const CmsContent = model(
  "CmsContent",
  new Schema(
    {
      slug: { type: String, required: true, unique: true, index: true },
      title: { type: String, required: true },
      blocks: { type: [Schema.Types.Mixed], default: [] },
      status: { type: String, enum: ["draft", "published"], default: "draft" },
      updatedBy: { type: String }
    },
    commonOptions
  )
);

export const QuizQuestion = model(
  "QuizQuestion",
  new Schema(
    {
      lessonId: { type: Schema.Types.ObjectId, ref: "Lesson", index: true },
      prompt: { type: String, required: true },
      type: { type: String, enum: ["single", "multiple", "text"], default: "single" },
      options: { type: [String], default: [] },
      correctAnswers: { type: [String], default: [] },
      points: { type: Number, default: 1 }
    },
    commonOptions
  )
);
