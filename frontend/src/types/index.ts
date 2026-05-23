export type Role = "admin" | "instructor" | "student";

export interface User {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  status: string;
  createdAt: string;
}

export interface ApiList<T> {
  data: T[];
  meta?: {
    page: number;
    pageSize: number;
    total: number;
  };
}

export interface Student {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  studentCode: string;
  department: string;
  semester: number;
  status: string;
  classIds?: string | null;
  classNames?: string | null;
}

export interface Instructor {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  specialization: string;
  status: string;
  classIds?: string | null;
  classNames?: string | null;
}

export interface Course {
  id: string;
  title: string;
  description: string;
  instructorId: string;
  instructorName?: string;
  level: string;
  status: string;
}

export interface ClassRecord {
  id: string;
  courseId: string;
  courseTitle: string;
  instructorId?: string;
  instructorName?: string;
  room: string;
  schedule: Record<string, unknown> | string;
  startsAt?: string;
  endsAt?: string;
}

export interface ClassDay {
  _id: string;
  classId: string;
  courseId: string;
  dayNumber: number;
  title: string;
  content: string;
  blocks: { type: string; text?: string; url?: string }[];
  assets: string[];
  published: boolean;
}

export interface ClassComment {
  _id: string;
  classId: string;
  message: string;
  authorId: string;
  authorName: string;
  authorRole: "admin" | "instructor";
  parentId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Assignment {
  id: string;
  courseId: string;
  classId?: string | null;
  dayId?: string | null;
  courseTitle?: string;
  classRoom?: string;
  title: string;
  description: string;
  dueDate: string;
  points: number;
}

export interface AttendanceRecord {
  id: string;
  studentId: string;
  classId: string;
  dayId?: string;
  studentName: string;
  courseTitle: string;
  status: "present" | "absent" | "late" | "excused";
  date: string;
  notes?: string;
  createdAt?: string;
  editableUntil?: string;
  isEditable?: number | boolean;
}

export interface NotificationItem {
  _id: string;
  title: string;
  message: string;
  type: string;
  readAt?: string | null;
  createdAt: string;
}

export type CopilotMode = "ask" | "tutor" | "draft" | "admin" | "instructor";

export interface CopilotCitation {
  id: string;
  title: string;
  type: string;
  source: string;
  metadata?: Record<string, unknown>;
}

export interface CopilotThread {
  _id: string;
  userId: string;
  role: Role;
  title: string;
  mode: CopilotMode;
  lastMessageAt: string;
  createdAt: string;
}

export interface CopilotMessage {
  _id: string;
  threadId: string;
  userId: string;
  role: "user" | "assistant";
  content: string;
  provider: string;
  citations: CopilotCitation[];
  actions: { type: string; label: string; payload?: Record<string, unknown> }[];
  createdAt: string;
}

export interface CopilotDraft {
  _id: string;
  createdBy: string;
  approvedBy?: string;
  type: "student_message" | "lesson" | "assignment" | "rubric" | "feedback" | "admin_intervention" | "policy" | "note";
  title: string;
  content: string;
  status: "pending" | "approved" | "rejected";
  targetRole?: Role;
  targetUserId?: string;
  targetEntity?: string;
  targetEntityId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CopilotDocument {
  _id: string;
  uploadedBy: string;
  title: string;
  fileUrl: string;
  originalName: string;
  mimeType: string;
  size: number;
  extractedText?: string;
  visibility: "all" | "role" | "private";
  targetRole?: Role;
  status: "ready" | "metadata_only";
  createdAt: string;
}
