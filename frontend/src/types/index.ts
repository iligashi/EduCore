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

export interface PublicCourse {
  id: string;
  title: string;
  description: string;
  instructorName?: string;
  level: string;
  status: string;
  classCount: number;
  nextStartAt?: string | null;
}

export interface CourseApplication {
  _id: string;
  fullName: string;
  email: string;
  phone?: string;
  courseId?: string;
  courseTitle: string;
  educationLevel?: string;
  message?: string;
  status: "pending" | "reviewed" | "accepted" | "rejected" | "enrolled";
  stage: "new" | "under_review" | "interview" | "accepted" | "rejected" | "enrolled";
  interviewAt?: string | null;
  notes?: string;
  studentUserId?: string;
  studentId?: string;
  credentialsSentAt?: string | null;
  decisionEmailSentAt?: string | null;
  lastEmailStatus?: "sent" | "preview" | "failed" | null;
  lastEmailError?: string;
  enrolledClassId?: string;
  enrolledAt?: string | null;
  reviewedBy?: string;
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmailLog {
  _id: string;
  to: string;
  subject: string;
  category: string;
  status: "sent" | "preview" | "failed";
  providerMessageId?: string;
  error?: string;
  relatedEntity?: string;
  relatedEntityId?: string;
  sentBy?: string;
  createdAt: string;
}

export interface AuditLog {
  _id: string;
  userId?: string;
  action: string;
  entity: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface StudentDocument {
  _id: string;
  studentId: string;
  userId: string;
  fullName: string;
  title: string;
  type: string;
  fileUrl: string;
  originalName: string;
  mimeType: string;
  size: number;
  status: "pending" | "approved" | "rejected";
  notes?: string;
  reviewedBy?: string;
  reviewedAt?: string | null;
  createdAt: string;
}

export interface GradebookRow {
  studentId: string;
  studentUserId: string;
  studentName: string;
  email: string;
  classId: string;
  courseId: string;
  courseTitle: string;
  instructorName: string;
  room: string;
  totalAssignments: number;
  submittedAssignments: number;
  gradedSubmissions: number;
  averageGrade: number | null;
  certificateEligible: boolean;
}

export interface Certificate {
  _id: string;
  studentId: string;
  studentUserId: string;
  studentName: string;
  classId: string;
  courseId: string;
  courseTitle: string;
  classRoom: string;
  instructorName?: string;
  finalGrade: number | null;
  verificationCode: string;
  status: "issued" | "revoked";
  issuedBy: string;
  issuedAt: string;
  revokedAt?: string | null;
  templateSnapshot?: CertificateTemplate;
}

export interface CertificateElement {
  id: string;
  kind: "title" | "subtitle" | "student" | "course" | "date" | "code" | "grade" | "signature" | "custom";
  label?: string;
  text?: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  fontFamily: string;
  color: string;
  align: "left" | "center" | "right";
  weight: "normal" | "semibold" | "bold";
  italic: boolean;
}

export interface CertificateTemplate {
  _id?: string;
  name: string;
  page: {
    background: string;
    borderColor: string;
    accentColor: string;
    paper: "landscape" | "portrait";
  };
  elements: CertificateElement[];
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

export interface QuizQuestion {
  _id: string;
  lessonId?: string;
  classDayId?: string;
  classId?: string;
  courseId?: string;
  prompt: string;
  type: "single" | "multiple" | "text";
  options: string[];
  correctAnswers: string[];
  explanation?: string;
  points: number;
  timeLimitSeconds?: number;
}

export interface QuizSessionQuestion {
  id: string;
  prompt: string;
  options: string[];
  points: number;
  timeLimitSeconds: number;
  correctAnswer?: string;
  explanation?: string;
}

export interface QuizAttemptAnswer {
  questionId: string;
  prompt: string;
  selectedOption: string;
  correctOption: string;
  isCorrect: boolean;
  points: number;
  explanation?: string;
}

export interface QuizAttempt {
  _id: string;
  sessionId: string;
  studentId: string;
  studentUserId: string;
  studentName: string;
  status: "accepted" | "submitted";
  acceptedAt: string;
  submittedAt?: string | null;
  answers: QuizAttemptAnswer[];
  score: number;
  total: number;
}

export interface QuizSession {
  _id: string;
  classId: string;
  courseId: string;
  courseTitle: string;
  room: string;
  dayId: string;
  dayNumber?: number | null;
  dayTitle: string;
  status: "open" | "closed";
  startedAt: string;
  timeLimitSeconds: number;
  participantCount: number;
  submittedCount?: number;
  questions: QuizSessionQuestion[];
  attempt?: QuizAttempt | null;
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
