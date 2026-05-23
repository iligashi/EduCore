import { env } from "../../config/env.js";
import { ActivityLog, Announcement, ClassDay, CmsContent, CopilotDocument } from "../../database/mongo.models.js";
import { rows } from "../../database/mysql.js";

export type CopilotMode = "ask" | "tutor" | "draft" | "admin" | "instructor";

export interface CopilotCitation {
  id: string;
  title: string;
  type: string;
  source: string;
  metadata?: Record<string, unknown>;
}

export interface CopilotContextChunk extends CopilotCitation {
  body: string;
}

export interface CopilotContext {
  role: Express.UserClaims["role"];
  mode: CopilotMode;
  summary: string;
  capabilities: string[];
  suggestions: string[];
  metrics: Record<string, number | string | null>;
  chunks: CopilotContextChunk[];
}

export interface CopilotAnswer {
  content: string;
  provider: "groq" | "openai" | "educore";
  citations: CopilotCitation[];
  actions: { type: string; label: string; payload?: Record<string, unknown> }[];
  metadata: Record<string, unknown>;
}

type ExternalProvider = "groq" | "openai";

interface ProviderConfig {
  provider: ExternalProvider;
  endpoint: "chat_completions" | "responses";
  apiKey: string;
  baseUrl: string;
  model: string;
}

interface StudentCourseRow {
  classId: string;
  courseId: string;
  courseTitle: string;
  description: string;
  room: string;
  instructorName: string;
  startsAt: string | null;
  endsAt: string | null;
}

interface AssignmentRow {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  points: number;
  courseTitle: string;
  room: string | null;
  submittedAt: string | null;
  grade: number | null;
  feedback: string | null;
  fileUrl: string | null;
}

interface InstructorClassRow {
  classId: string;
  courseId: string;
  courseTitle: string;
  room: string;
  studentCount: number;
  startsAt: string | null;
  endsAt: string | null;
}

function cleanText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function chunk(input: CopilotContextChunk | null | undefined): CopilotContextChunk[] {
  return input ? [input] : [];
}

function scoreChunk(query: string, item: CopilotContextChunk) {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((term) => term.length > 2);
  if (!terms.length) return 1;
  const haystack = `${item.title} ${item.type} ${item.body}`.toLowerCase();
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 2 : 0), 0) + (item.body.length > 80 ? 1 : 0);
}

function pickChunks(query: string, chunks: CopilotContextChunk[], limit = 10) {
  return [...chunks]
    .map((item) => ({ item, score: scoreChunk(query, item) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ item }) => item);
}

function roleCapabilities(role: Express.UserClaims["role"]) {
  if (role === "student") {
    return [
      "Explain lessons using enrolled class content",
      "Summarize upcoming assignments and grades",
      "Create practice questions and study plans",
      "Draft messages that require human approval before sending"
    ];
  }
  if (role === "instructor") {
    return [
      "Draft lessons, assignments, rubrics, and feedback",
      "Find ungraded work and attendance concerns",
      "Summarize class progress from owned classes only",
      "Prepare student messages for approval"
    ];
  }
  return [
    "Summarize class health, attendance, grading, and risk signals",
    "Draft admin notifications and interventions for approval",
    "Review CMS, course, and operational activity",
    "Audit AI conversations and draft decisions"
  ];
}

function roleSuggestions(role: Express.UserClaims["role"]) {
  if (role === "student") {
    return [
      "What should I work on next?",
      "Explain my latest lesson in simple steps.",
      "Make a study plan for this week.",
      "Quiz me from my class content."
    ];
  }
  if (role === "instructor") {
    return [
      "Which submissions still need grading?",
      "Draft feedback for pending work.",
      "Create a lesson outline for my next class.",
      "Summarize attendance concerns in my classes."
    ];
  }
  return [
    "Show the highest risk students and why.",
    "Summarize class health across the school.",
    "Draft a grading reminder notification.",
    "Which operations need admin attention today?"
  ];
}

async function studentContext(user: Express.UserClaims) {
  const [student] = await rows<{ id: string }>("SELECT id FROM students WHERE user_id = :userId", { userId: user.id });
  if (!student) {
    return {
      metrics: { courses: 0, openAssignments: 0, gradedSubmissions: 0 },
      chunks: [
        {
          id: user.id,
          title: "Student profile",
          type: "profile",
          source: "EduCore",
          body: "No student profile is linked to this account."
        }
      ]
    };
  }

  const [classes, assignments, submissions] = await Promise.all([
    rows<StudentCourseRow>(
      `SELECT classes.id AS classId, courses.id AS courseId, courses.title AS courseTitle,
              courses.description, classes.room, users.full_name AS instructorName,
              classes.starts_at AS startsAt, classes.ends_at AS endsAt
       FROM enrollments
       JOIN classes ON classes.id = enrollments.class_id
       JOIN courses ON courses.id = classes.course_id
       JOIN instructors ON instructors.id = courses.instructor_id
       JOIN users ON users.id = instructors.user_id
       WHERE enrollments.student_id = :studentId AND enrollments.status = 'active'
       ORDER BY courses.title`,
      { studentId: student.id }
    ),
    rows<AssignmentRow>(
      `SELECT assignments.id, assignments.title, assignments.description,
              assignments.due_date AS dueDate, assignments.points,
              courses.title AS courseTitle, classes.room,
              submissions.submitted_at AS submittedAt, submissions.grade,
              submissions.feedback, submissions.file_url AS fileUrl
       FROM assignments
       JOIN courses ON courses.id = assignments.course_id
       LEFT JOIN classes ON classes.id = assignments.class_id
       JOIN enrollments ON enrollments.student_id = :studentId
         AND enrollments.status = 'active'
         AND enrollments.class_id = COALESCE(assignments.class_id, enrollments.class_id)
       LEFT JOIN submissions ON submissions.assignment_id = assignments.id AND submissions.student_id = :studentId
       WHERE enrollments.class_id IN (
         SELECT class_id FROM enrollments WHERE student_id = :studentId AND status = 'active'
       )
       ORDER BY assignments.due_date ASC
       LIMIT 30`,
      { studentId: student.id }
    ),
    rows<AssignmentRow>(
      `SELECT submissions.id, assignments.title, assignments.description,
              assignments.due_date AS dueDate, assignments.points,
              courses.title AS courseTitle, classes.room,
              submissions.submitted_at AS submittedAt, submissions.grade,
              submissions.feedback, submissions.file_url AS fileUrl
       FROM submissions
       JOIN assignments ON assignments.id = submissions.assignment_id
       JOIN courses ON courses.id = assignments.course_id
       LEFT JOIN classes ON classes.id = assignments.class_id
       WHERE submissions.student_id = :studentId
       ORDER BY submissions.submitted_at DESC
       LIMIT 20`,
      { studentId: student.id }
    )
  ]);

  const classIds = classes.map((item) => item.classId);
  const [days, announcements] = await Promise.all([
    classIds.length ? ClassDay.find({ classId: { $in: classIds }, published: true }).sort({ dayNumber: 1 }).limit(80).lean() : [],
    Announcement.find({ audience: { $in: ["all", "student"] } }).sort({ publishedAt: -1, createdAt: -1 }).limit(20).lean()
  ]);

  const openAssignments = assignments.filter((item) => !item.submittedAt).length;
  const gradedSubmissions = submissions.filter((item) => item.grade !== null && item.grade !== undefined).length;
  const chunks: CopilotContextChunk[] = [
    ...classes.map((item) => ({
      id: item.classId,
      title: item.courseTitle,
      type: "class",
      source: "enrollment",
      body: `${item.courseTitle}. ${item.description} Instructor: ${item.instructorName}. Room: ${item.room}. Starts: ${item.startsAt ?? "not set"}.`
    })),
    ...assignments.map((item) => ({
      id: item.id,
      title: item.title,
      type: "assignment",
      source: "assignments",
      body: `${item.title} for ${item.courseTitle}. Due ${item.dueDate}. Points ${item.points}. ${item.description} Status: ${
        item.submittedAt ? "submitted" : "not submitted"
      }. Grade: ${item.grade ?? "not graded"}. Feedback: ${item.feedback ?? ""}. File: ${item.fileUrl ?? ""}`
    })),
    ...days.map((day) => ({
      id: String(day._id),
      title: `Day ${day.dayNumber}: ${day.title}`,
      type: "lesson",
      source: "class-days",
      body: `${day.content} ${(day.blocks ?? []).map((block) => cleanText((block as { text?: unknown }).text)).join(" ")} ${(day.assets ?? []).join(" ")}`
    })),
    ...announcements.map((item) => ({
      id: String(item._id),
      title: item.title,
      type: "announcement",
      source: "cms",
      body: item.body
    }))
  ];

  return { metrics: { courses: classes.length, openAssignments, gradedSubmissions }, chunks };
}

async function instructorContext(user: Express.UserClaims) {
  const [instructor] = await rows<{ id: string }>("SELECT id FROM instructors WHERE user_id = :userId", { userId: user.id });
  if (!instructor) {
    return {
      metrics: { classes: 0, ungradedSubmissions: 0, students: 0 },
      chunks: [
        {
          id: user.id,
          title: "Instructor profile",
          type: "profile",
          source: "EduCore",
          body: "No instructor profile is linked to this account."
        }
      ]
    };
  }

  const [classes, ungraded, attendance] = await Promise.all([
    rows<InstructorClassRow>(
      `SELECT classes.id AS classId, courses.id AS courseId, courses.title AS courseTitle, classes.room,
              COUNT(DISTINCT enrollments.student_id) AS studentCount,
              classes.starts_at AS startsAt, classes.ends_at AS endsAt
       FROM classes
       JOIN courses ON courses.id = classes.course_id
       LEFT JOIN enrollments ON enrollments.class_id = classes.id AND enrollments.status = 'active'
       WHERE courses.instructor_id = :instructorId
       GROUP BY classes.id, courses.id, courses.title, classes.room, classes.starts_at, classes.ends_at
       ORDER BY courses.title, classes.room`,
      { instructorId: instructor.id }
    ),
    rows<{ assignmentId: string; title: string; courseTitle: string; ungraded: number }>(
      `SELECT assignments.id AS assignmentId, assignments.title, courses.title AS courseTitle,
              COUNT(submissions.id) AS ungraded
       FROM assignments
       JOIN courses ON courses.id = assignments.course_id
       LEFT JOIN submissions ON submissions.assignment_id = assignments.id AND submissions.grade IS NULL
       WHERE courses.instructor_id = :instructorId
       GROUP BY assignments.id, assignments.title, courses.title
       HAVING ungraded > 0
       ORDER BY ungraded DESC`,
      { instructorId: instructor.id }
    ),
    rows<{ courseTitle: string; status: string; total: number }>(
      `SELECT courses.title AS courseTitle, attendance.status, COUNT(*) AS total
       FROM attendance
       JOIN classes ON classes.id = attendance.class_id
       JOIN courses ON courses.id = classes.course_id
       WHERE courses.instructor_id = :instructorId
       GROUP BY courses.title, attendance.status
       ORDER BY courses.title, attendance.status`,
      { instructorId: instructor.id }
    )
  ]);

  const classIds = classes.map((item) => item.classId);
  const [days, announcements] = await Promise.all([
    classIds.length ? ClassDay.find({ classId: { $in: classIds } }).sort({ dayNumber: 1 }).limit(100).lean() : [],
    Announcement.find({ audience: { $in: ["all", "instructor"] } }).sort({ publishedAt: -1, createdAt: -1 }).limit(20).lean()
  ]);

  const ungradedSubmissions = ungraded.reduce((total, item) => total + Number(item.ungraded ?? 0), 0);
  const studentCount = classes.reduce((total, item) => total + Number(item.studentCount ?? 0), 0);
  const chunks: CopilotContextChunk[] = [
    ...classes.map((item) => ({
      id: item.classId,
      title: item.courseTitle,
      type: "class",
      source: "instructor-classes",
      body: `${item.courseTitle} in ${item.room}. Enrolled students: ${item.studentCount}. Starts: ${item.startsAt ?? "not set"}.`
    })),
    ...ungraded.map((item) => ({
      id: item.assignmentId,
      title: item.title,
      type: "ungraded-submissions",
      source: "assignments",
      body: `${item.title} in ${item.courseTitle} has ${item.ungraded} ungraded submission${Number(item.ungraded) === 1 ? "" : "s"}.`
    })),
    ...attendance.map((item) => ({
      id: `${item.courseTitle}-${item.status}`,
      title: `${item.courseTitle} attendance`,
      type: "attendance",
      source: "attendance",
      body: `${item.courseTitle}: ${item.total} ${item.status} attendance record${Number(item.total) === 1 ? "" : "s"}.`
    })),
    ...days.map((day) => ({
      id: String(day._id),
      title: `Day ${day.dayNumber}: ${day.title}`,
      type: "lesson",
      source: "class-days",
      body: `${day.published ? "Published" : "Draft"} lesson. ${day.content} ${(day.blocks ?? [])
        .map((block) => cleanText((block as { text?: unknown }).text))
        .join(" ")} ${(day.assets ?? []).join(" ")}`
    })),
    ...announcements.map((item) => ({
      id: String(item._id),
      title: item.title,
      type: "announcement",
      source: "cms",
      body: item.body
    }))
  ];

  return { metrics: { classes: classes.length, ungradedSubmissions, students: studentCount }, chunks };
}

async function adminContext() {
  const [[studentTotal], [instructorTotal], [courseTotal], [assignmentTotal], riskStudents, classHealth, cmsPages, recentActivity] =
    await Promise.all([
      rows<{ total: number }>("SELECT COUNT(*) AS total FROM students"),
      rows<{ total: number }>("SELECT COUNT(*) AS total FROM instructors"),
      rows<{ total: number }>("SELECT COUNT(*) AS total FROM courses"),
      rows<{ total: number }>("SELECT COUNT(*) AS total FROM assignments"),
      rows<{ studentId: string; studentName: string; attendanceRate: number | null; averageGrade: number | null; missingSubmissions: number | null }>(
        `SELECT students.id AS studentId, users.full_name AS studentName,
                COALESCE(attendanceStats.attendanceRate, 100) AS attendanceRate,
                gradeStats.averageGrade,
                COALESCE(missingStats.missingSubmissions, 0) AS missingSubmissions
         FROM students
         JOIN users ON users.id = students.user_id
         LEFT JOIN (
           SELECT student_id,
                  ROUND(100 * SUM(CASE WHEN status IN ('present', 'late', 'excused') THEN 1 ELSE 0 END) / COUNT(*), 0) AS attendanceRate
           FROM attendance
           GROUP BY student_id
         ) attendanceStats ON attendanceStats.student_id = students.id
         LEFT JOIN (
           SELECT student_id, ROUND(AVG(grade), 2) AS averageGrade
           FROM submissions
           WHERE grade IS NOT NULL
           GROUP BY student_id
         ) gradeStats ON gradeStats.student_id = students.id
         LEFT JOIN (
           SELECT students.id AS studentId, COUNT(DISTINCT assignments.id) - COUNT(DISTINCT submissions.assignment_id) AS missingSubmissions
           FROM students
           JOIN enrollments ON enrollments.student_id = students.id AND enrollments.status = 'active'
           JOIN classes ON classes.id = enrollments.class_id
           JOIN assignments ON assignments.course_id = classes.course_id
             AND (assignments.class_id IS NULL OR assignments.class_id = classes.id)
           LEFT JOIN submissions ON submissions.assignment_id = assignments.id AND submissions.student_id = students.id
           WHERE assignments.due_date < NOW()
           GROUP BY students.id
         ) missingStats ON missingStats.studentId = students.id
         WHERE COALESCE(attendanceStats.attendanceRate, 100) < 75
            OR gradeStats.averageGrade < 65
            OR COALESCE(missingStats.missingSubmissions, 0) > 0
         ORDER BY COALESCE(attendanceStats.attendanceRate, 100), missingSubmissions DESC
         LIMIT 12`
      ),
      rows<{ classId: string; courseTitle: string; room: string; instructorName: string; enrolledStudents: number; assignmentCount: number }>(
        `SELECT classes.id AS classId, courses.title AS courseTitle, classes.room,
                users.full_name AS instructorName,
                COUNT(DISTINCT enrollments.student_id) AS enrolledStudents,
                COUNT(DISTINCT assignments.id) AS assignmentCount
         FROM classes
         JOIN courses ON courses.id = classes.course_id
         JOIN instructors ON instructors.id = courses.instructor_id
         JOIN users ON users.id = instructors.user_id
         LEFT JOIN enrollments ON enrollments.class_id = classes.id AND enrollments.status = 'active'
         LEFT JOIN assignments ON assignments.course_id = courses.id
         GROUP BY classes.id, courses.title, classes.room, users.full_name
         ORDER BY courses.title
         LIMIT 25`
      ),
      CmsContent.find({}).sort({ updatedAt: -1 }).limit(15).lean(),
      ActivityLog.find({}).sort({ createdAt: -1 }).limit(20).lean()
    ]);

  const chunks: CopilotContextChunk[] = [
    {
      id: "system-totals",
      title: "System totals",
      type: "admin-health",
      source: "reports",
      body: `Students: ${studentTotal.total}. Instructors: ${instructorTotal.total}. Courses: ${courseTotal.total}. Assignments: ${assignmentTotal.total}.`
    },
    ...riskStudents.map((item) => ({
      id: item.studentId,
      title: item.studentName,
      type: "risk-student",
      source: "reports",
      body: `${item.studentName}: attendance ${item.attendanceRate ?? "unknown"}%, average grade ${
        item.averageGrade ?? "no grades"
      }, missing submissions ${item.missingSubmissions ?? 0}.`
    })),
    ...classHealth.map((item) => ({
      id: item.classId,
      title: `${item.courseTitle} / ${item.room}`,
      type: "class-health",
      source: "reports",
      body: `${item.courseTitle} / ${item.room}. Instructor: ${item.instructorName}. Students: ${item.enrolledStudents}. Assignments: ${item.assignmentCount}.`
    })),
    ...cmsPages.map((item) => ({
      id: String(item._id),
      title: item.title,
      type: "cms",
      source: "cms",
      body: `CMS page ${item.slug} is ${item.status}. ${(item.blocks ?? []).map((block) => cleanText((block as { text?: unknown }).text)).join(" ")}`
    })),
    ...recentActivity.map((item) => ({
      id: String(item._id),
      title: item.action,
      type: "activity",
      source: "activity-log",
      body: `${item.action} on ${item.entity}${item.entityId ? ` ${item.entityId}` : ""}. Metadata: ${JSON.stringify(item.metadata ?? {})}`
    }))
  ];

  return {
    metrics: {
      students: studentTotal.total,
      instructors: instructorTotal.total,
      courses: courseTotal.total,
      assignments: assignmentTotal.total,
      riskStudents: riskStudents.length
    },
    chunks
  };
}

async function documentContext(user: Express.UserClaims) {
  const query =
    user.role === "admin"
      ? {}
      : {
          $or: [{ visibility: "all" }, { targetRole: user.role }, { uploadedBy: user.id }]
        };
  const documents = await CopilotDocument.find(query).sort({ updatedAt: -1 }).limit(30).lean();
  return documents.map((item) => ({
    id: String(item._id),
    title: item.title,
    type: "document",
    source: "copilot-documents",
    body: `${item.originalName} (${item.mimeType}). ${
      item.extractedText
        ? item.extractedText
        : "The document is available as a file reference, but text extraction is not available for this file type yet."
    }`,
    metadata: {
      fileUrl: item.fileUrl,
      status: item.status,
      visibility: item.visibility,
      targetRole: item.targetRole
    }
  }));
}

export async function buildCopilotContext(user: Express.UserClaims, mode: CopilotMode, query = ""): Promise<CopilotContext> {
  const roleContext =
    user.role === "student" ? await studentContext(user) : user.role === "instructor" ? await instructorContext(user) : await adminContext();
  const documents = await documentContext(user);
  const chunks = [...roleContext.chunks, ...documents];
  const picked = query ? pickChunks(query, chunks, 12) : chunks.slice(0, 12);
  const summary =
    user.role === "student"
      ? "Student context is limited to enrolled classes, published lessons, own assignments, own submissions, and student announcements."
      : user.role === "instructor"
        ? "Instructor context is limited to classes and students assigned to the signed-in instructor."
        : "Admin context includes system-wide health, CMS, risk, attendance, grading, and activity signals.";

  return {
    role: user.role,
    mode,
    summary,
    capabilities: roleCapabilities(user.role),
    suggestions: roleSuggestions(user.role),
    metrics: roleContext.metrics,
    chunks: picked
  };
}

function fallbackAnswer(user: Express.UserClaims, message: string, context: CopilotContext, citations: CopilotCitation[]) {
  const important = context.chunks.slice(0, 5);
  const lines = [
    `I reviewed the available ${user.role} context in EduCore.`,
    "",
    important.length
      ? "Most relevant findings:"
      : "I do not have enough matching EduCore context yet. Try asking about a specific course, class, assignment, student, or document.",
    ...important.map((item) => `- ${item.title}: ${item.body.slice(0, 220)}${item.body.length > 220 ? "..." : ""}`),
    "",
    context.mode === "draft"
      ? "Draft-ready next step: save this response as an approval draft, then review it before sending or applying it."
      : "Next step: ask for a draft, summary, study plan, quiz, grading reminder, or risk explanation if you want a more specific output.",
    "",
    `User request: ${message}`
  ];

  return {
    content: lines.join("\n"),
    provider: "educore" as const,
    citations,
    actions: [
      {
        type: "save_draft",
        label: "Save as approval draft",
        payload: { source: "copilot", mode: context.mode }
      }
    ],
    metadata: { fallback: true, reason: configuredProvider() ? "provider_error" : "provider_not_configured" }
  };
}

function responseText(payload: unknown) {
  const data = payload as {
    output_text?: unknown;
    output?: { content?: { type?: string; text?: unknown }[] }[];
  };
  if (typeof data.output_text === "string" && data.output_text.trim()) return data.output_text.trim();
  const text = (data.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => String(item.text))
    .join("\n")
    .trim();
  return text || "";
}

function chatCompletionText(payload: unknown) {
  const data = payload as {
    choices?: { message?: { content?: unknown } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  return typeof content === "string" ? content.trim() : "";
}

function configuredProvider(): ProviderConfig | null {
  if (env.GROQ_API_KEY) {
    return {
      provider: "groq",
      endpoint: "chat_completions",
      apiKey: env.GROQ_API_KEY,
      baseUrl: env.GROQ_BASE_URL,
      model: env.GROQ_MODEL || "llama-3.3-70b-versatile"
    };
  }

  if (env.OPENAI_API_KEY) {
    return {
      provider: "openai",
      endpoint: "responses",
      apiKey: env.OPENAI_API_KEY,
      baseUrl: env.OPENAI_BASE_URL,
      model: env.OPENAI_MODEL || "gpt-5"
    };
  }

  return null;
}

export async function answerWithCopilot(user: Express.UserClaims, message: string, context: CopilotContext): Promise<CopilotAnswer> {
  const citations = context.chunks.map(({ body: _body, ...citation }) => citation);
  const fallback = fallbackAnswer(user, message, context, citations);
  const provider = configuredProvider();

  if (!provider) return fallback;

  const instructions = [
    "You are EduCore Copilot inside an LMS and DMS.",
    "Use only the supplied EduCore context. If the context is insufficient, say what is missing.",
    "Respect role boundaries: students only get their own class/material context, instructors only their assigned classes, admins can discuss system-wide operations.",
    "Do not finalize grades, send messages, suspend users, or publish content. Draft these actions for human approval.",
    "Be concise, practical, and cite context using source titles when useful."
  ].join("\n");
  const input = [
    `Signed-in user: ${user.fullName} (${user.role})`,
    `Mode: ${context.mode}`,
    `Context policy: ${context.summary}`,
    "Context:",
    ...context.chunks.map((item, index) => `[${index + 1}] ${item.type} / ${item.title} / ${item.source}: ${item.body.slice(0, 1200)}`),
    "",
    `User request: ${message}`
  ].join("\n");

  try {
    const response = await fetch(`${provider.baseUrl.replace(/\/$/, "")}/${provider.endpoint === "chat_completions" ? "chat/completions" : "responses"}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`
      },
      body: JSON.stringify(
        provider.endpoint === "chat_completions"
          ? {
              model: provider.model,
              messages: [
                { role: "system", content: instructions },
                { role: "user", content: input }
              ]
            }
          : {
              model: provider.model,
              instructions,
              input
            }
      )
    });

    if (!response.ok) {
      return { ...fallback, metadata: { ...fallback.metadata, provider: provider.provider, providerStatus: response.status } };
    }

    const payload = await response.json();
    const content = provider.endpoint === "chat_completions" ? chatCompletionText(payload) : responseText(payload);
    if (!content) return fallback;

    return {
      content,
      provider: provider.provider,
      citations,
      actions: fallback.actions,
      metadata: { model: provider.model }
    };
  } catch (error) {
    return {
      ...fallback,
      metadata: {
        ...fallback.metadata,
        provider: provider.provider,
        providerError: error instanceof Error ? error.message : "Unknown provider error"
      }
    };
  }
}
