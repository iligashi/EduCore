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

export const Notification = model(
  "Notification",
  new Schema(
    {
      userId: { type: String, index: true },
      role: { type: String, enum: ["admin", "instructor", "student"], index: true },
      title: { type: String, required: true },
      message: { type: String, required: true },
      type: { type: String, default: "system" },
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
