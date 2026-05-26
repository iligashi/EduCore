import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { ActivityLog, ClassDay, Notification, QuizAttempt, QuizQuestion, QuizSession } from "../../database/mongo.models.js";
import { rows } from "../../database/mysql.js";
import { authorize } from "../../middleware/authorize.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { getIo } from "../../realtime/socket.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { HttpError } from "../../utils/http-error.js";

export const quizRoutes = Router();

const generateQuizSchema = z.object({
  body: z.object({
    dayId: z.string().min(1),
    count: z.coerce.number().int().min(3).max(10).default(5),
    timeLimitSeconds: z.coerce.number().int().min(10).max(90).default(20)
  })
});

const startQuizSchema = z.object({
  body: z.object({
    dayId: z.string().min(1),
    questionIds: z.array(z.string()).default([]),
    timeLimitSeconds: z.coerce.number().int().min(10).max(90).default(20)
  })
});

const submitQuizSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    answers: z.array(
      z.object({
        questionId: z.string().min(1),
        selectedOption: z.string().max(300).optional().default("")
      })
    )
  })
});

const idParamsSchema = z.object({
  params: z.object({ id: z.string().min(1) })
});

const generatedQuestionSchema = z.object({
  prompt: z.string().min(8).max(240),
  options: z.array(z.string().min(1).max(140)).length(4),
  correctAnswer: z.string().min(1).max(140),
  explanation: z.string().max(260).optional().default("")
});

type GeneratedQuestion = z.infer<typeof generatedQuestionSchema>;

interface ClassRecord {
  classId: string;
  courseId: string;
  courseTitle: string;
  room: string;
  instructorUserId: string;
}

interface PresentStudent {
  studentId: string;
  studentUserId: string;
  studentName: string;
  email: string;
}

function cleanText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function plain<T>(value: T): T {
  const maybeDocument = value as { toObject?: () => T };
  return typeof maybeDocument?.toObject === "function" ? maybeDocument.toObject() : value;
}

function lessonBody(day: { title?: unknown; content?: unknown; blocks?: unknown[]; assets?: unknown[] }) {
  const blockText = (day.blocks ?? [])
    .map((block) => {
      if (!block || typeof block !== "object") return "";
      const item = block as { text?: unknown; url?: unknown };
      return cleanText(item.text ?? item.url);
    })
    .filter(Boolean)
    .join(" ");

  return cleanText([day.title, day.content, blockText, (day.assets ?? []).join(" ")].filter(Boolean).join(" "));
}

function normalizeGeneratedQuestions(input: unknown): GeneratedQuestion[] {
  const parsed = z.array(generatedQuestionSchema).safeParse(input);
  if (!parsed.success) return [];

  return parsed.data
    .map((question) => {
      const options = [...new Set(question.options.map((option) => cleanText(option)).filter(Boolean))].slice(0, 4);
      if (options.length !== 4) return null;

      const correctIndex = ["A", "B", "C", "D"].indexOf(question.correctAnswer.trim().toUpperCase());
      const correctAnswer =
        correctIndex >= 0
          ? options[correctIndex]
          : options.find((option) => option.toLowerCase() === question.correctAnswer.trim().toLowerCase());
      if (!correctAnswer) return null;

      return {
        prompt: cleanText(question.prompt),
        options,
        correctAnswer,
        explanation: cleanText(question.explanation)
      };
    })
    .filter((question): question is GeneratedQuestion => Boolean(question));
}

function extractJsonArray(text: string) {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function fallbackQuestions(day: { title?: unknown; dayNumber?: unknown; content?: unknown }, count: number): GeneratedQuestion[] {
  const title = cleanText(day.title) || "this lesson";
  const firstSentence = cleanText(day.content).split(/[.!?]/).find(Boolean) || title;
  const pool: GeneratedQuestion[] = [
    {
      prompt: `What is the main focus of "${title}"?`,
      options: [title, "Student billing", "Course enrollment forms", "General school policy"],
      correctAnswer: title,
      explanation: "The quiz is generated from the selected lesson."
    },
    {
      prompt: "Which material should students review before answering this quiz?",
      options: ["The selected class day lesson", "Only the gradebook", "Only attendance history", "Only the login page"],
      correctAnswer: "The selected class day lesson",
      explanation: "The live quiz is tied to the active class day."
    },
    {
      prompt: "What does this class-day quiz check?",
      options: ["Understanding of the current lesson", "Payment status", "Profile settings", "System permissions"],
      correctAnswer: "Understanding of the current lesson",
      explanation: "The questions are created from the lesson content."
    },
    {
      prompt: `Which statement best matches the lesson content?`,
      options: [firstSentence.slice(0, 120), "The lesson is unrelated to this class", "Students do not need to attend", "The quiz has no lesson source"],
      correctAnswer: firstSentence.slice(0, 120),
      explanation: "This option is taken from the class-day content."
    },
    {
      prompt: "Who receives a live quiz when the instructor starts it?",
      options: ["Students marked present for that class day", "Every user in the system", "Only administrators", "Students from unrelated classes"],
      correctAnswer: "Students marked present for that class day",
      explanation: "EduCore targets the quiz to present students for the selected day."
    }
  ];

  return pool.slice(0, Math.min(count, pool.length));
}

async function generateQuestionsWithAi(day: { title?: unknown; content?: unknown; blocks?: unknown[]; assets?: unknown[] }, count: number) {
  if (!env.GROQ_API_KEY) return null;

  const content = lessonBody(day).slice(0, 7000);
  const instructions = [
    "You write classroom quiz questions for EduCore.",
    "Return only a JSON array, no markdown.",
    "Each item must have: prompt, options, correctAnswer, explanation.",
    "Every question must have exactly 4 answer options.",
    "The correctAnswer must exactly match one of the 4 options.",
    "Keep questions specific to the supplied lesson content."
  ].join("\n");

  try {
    const response = await fetch(`${env.GROQ_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal: AbortSignal.timeout(12_000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: env.GROQ_MODEL,
        temperature: 0.25,
        messages: [
          { role: "system", content: instructions },
          { role: "user", content: `Create ${count} multiple-choice questions for this lesson:\n\n${content}` }
        ]
      })
    });

    if (!response.ok) return null;
    const payload = (await response.json()) as { choices?: { message?: { content?: unknown } }[] };
    const text = typeof payload.choices?.[0]?.message?.content === "string" ? payload.choices[0].message.content : "";
    const parsed = extractJsonArray(text);
    const questions = normalizeGeneratedQuestions(parsed);
    return questions.length ? questions : null;
  } catch {
    return null;
  }
}

async function getClassRecord(classId: string) {
  const [record] = await rows<ClassRecord>(
    `SELECT classes.id AS classId, classes.course_id AS courseId, courses.title AS courseTitle,
            classes.room, instructors.user_id AS instructorUserId
     FROM classes
     JOIN courses ON courses.id = classes.course_id
     JOIN instructors ON instructors.id = courses.instructor_id
     WHERE classes.id = :classId`,
    { classId }
  );

  if (!record) throw new HttpError(404, "Class not found");
  return record;
}

async function getDayForInstructor(user: Express.UserClaims, dayId: string) {
  const day = await ClassDay.findById(dayId);
  if (!day) throw new HttpError(404, "Class day not found");
  const classRecord = await getClassRecord(String(day.classId));
  if (user.role !== "admin" && classRecord.instructorUserId !== user.id) {
    throw new HttpError(403, "You can only manage quizzes for your assigned classes");
  }
  return { day, classRecord };
}

async function getStudentProfile(user: Express.UserClaims) {
  const [student] = await rows<{ studentId: string; studentUserId: string; studentName: string; email: string }>(
    `SELECT students.id AS studentId, students.user_id AS studentUserId, users.full_name AS studentName, users.email
     FROM students
     JOIN users ON users.id = students.user_id
     WHERE students.user_id = :userId`,
    { userId: user.id }
  );
  if (!student) throw new HttpError(403, "Student profile not found");
  return student;
}

async function assertStudentCanOpenSession(user: Express.UserClaims, session: Record<string, any>) {
  const student = await getStudentProfile(user);
  const isParticipant = (session.participants ?? []).some((participant: PresentStudent) => participant.studentUserId === user.id);
  if (!isParticipant) throw new HttpError(403, "This quiz is only available to students marked present for this class day");
  return student;
}

async function presentStudentsForDay(classId: string, dayId: string) {
  return rows<PresentStudent>(
    `SELECT DISTINCT students.id AS studentId, students.user_id AS studentUserId,
            users.full_name AS studentName, users.email
     FROM attendance
     JOIN students ON students.id = attendance.student_id
     JOIN users ON users.id = students.user_id
     JOIN enrollments ON enrollments.student_id = students.id
       AND enrollments.class_id = attendance.class_id
       AND enrollments.status = 'active'
     WHERE attendance.class_id = :classId
       AND attendance.class_day_id = :dayId
       AND attendance.status = 'present'
     ORDER BY users.full_name`,
    { classId, dayId }
  );
}

function publicQuestion(question: Record<string, any>) {
  return {
    id: String(question.id ?? question._id),
    prompt: question.prompt,
    options: question.options ?? [],
    points: Number(question.points ?? 1),
    timeLimitSeconds: Number(question.timeLimitSeconds ?? 20)
  };
}

function publicSession(sessionInput: Record<string, any>, attempt?: Record<string, any> | null) {
  const session = plain(sessionInput);
  return {
    _id: String(session._id),
    classId: session.classId,
    courseId: session.courseId,
    courseTitle: session.courseTitle,
    room: session.room,
    dayId: String(session.dayId),
    dayNumber: session.dayNumber,
    dayTitle: session.dayTitle,
    status: session.status,
    startedAt: session.startedAt,
    timeLimitSeconds: Number(session.timeLimitSeconds ?? 20),
    participantCount: (session.participants ?? []).length,
    questions: (session.questions ?? []).map(publicQuestion),
    attempt: attempt ? plain(attempt) : null
  };
}

function scoreAnswers(session: Record<string, any>, answers: { questionId: string; selectedOption: string }[]) {
  const answerByQuestion = new Map(answers.map((answer) => [answer.questionId, cleanText(answer.selectedOption)]));
  const checked = (session.questions ?? []).map((question: Record<string, any>) => {
    const selectedOption = answerByQuestion.get(String(question.id)) ?? "";
    const correctOption = cleanText(question.correctAnswer);
    const isCorrect = Boolean(selectedOption) && selectedOption.toLowerCase() === correctOption.toLowerCase();
    return {
      questionId: String(question.id),
      prompt: question.prompt,
      selectedOption,
      correctOption,
      isCorrect,
      points: Number(question.points ?? 1),
      explanation: question.explanation ?? ""
    };
  });
  const score = checked.reduce((total: number, answer: { isCorrect: boolean; points: number }) => total + (answer.isCorrect ? answer.points : 0), 0);
  const total = checked.reduce((sum: number, answer: { points: number }) => sum + answer.points, 0);
  return { answers: checked, score, total };
}

quizRoutes.get(
  "/questions",
  authorize("admin", "instructor"),
  asyncHandler(async (req, res) => {
    const dayId = String(req.query.dayId ?? "");
    if (!dayId) throw new HttpError(422, "dayId is required");
    await getDayForInstructor(req.user!, dayId);
    const data = await QuizQuestion.find({ classDayId: dayId }).sort({ createdAt: -1 }).lean();
    res.json({ data });
  })
);

quizRoutes.post(
  "/generate",
  authorize("admin", "instructor"),
  validate(generateQuizSchema),
  asyncHandler(async (req, res) => {
    const { day, classRecord } = await getDayForInstructor(req.user!, req.body.dayId);
    const generated = (await generateQuestionsWithAi(day, req.body.count)) ?? fallbackQuestions(day, req.body.count);
    if (!generated.length) throw new HttpError(422, "Could not generate quiz questions from this lesson");

    await QuizQuestion.deleteMany({ classDayId: day._id });
    const data = await QuizQuestion.insertMany(
      generated.map((question) => ({
        classDayId: day._id,
        classId: classRecord.classId,
        courseId: classRecord.courseId,
        prompt: question.prompt,
        type: "single",
        options: question.options,
        correctAnswers: [question.correctAnswer],
        explanation: question.explanation,
        points: 1,
        timeLimitSeconds: req.body.timeLimitSeconds,
        createdBy: req.user!.id
      }))
    );

    await ActivityLog.create({
      userId: req.user!.id,
      action: "quiz_questions_generated",
      entity: "quiz",
      entityId: String(day._id),
      metadata: { classId: classRecord.classId, dayId: String(day._id), questions: data.length }
    });

    res.status(201).json({ data });
  })
);

quizRoutes.get(
  "/sessions",
  authorize("admin", "instructor"),
  asyncHandler(async (req, res) => {
    const instructorClassFilter =
      req.user!.role === "instructor"
        ? await rows<{ classId: string }>(
            `SELECT classes.id AS classId
             FROM classes
             JOIN courses ON courses.id = classes.course_id
             JOIN instructors ON instructors.id = courses.instructor_id
             WHERE instructors.user_id = :userId`,
            { userId: req.user!.id }
          )
        : null;
    const classIds = instructorClassFilter?.map((item) => item.classId);
    const query = classIds ? { classId: { $in: classIds } } : {};
    const sessions = await QuizSession.find(query).sort({ startedAt: -1 }).limit(50).lean();
    const attempts = await QuizAttempt.find({ sessionId: { $in: sessions.map((session) => session._id) } }).lean();
    const attemptsBySession = attempts.reduce<Record<string, number>>((grouped, attempt) => {
      const key = String(attempt.sessionId);
      grouped[key] = (grouped[key] ?? 0) + (attempt.status === "submitted" ? 1 : 0);
      return grouped;
    }, {});

    res.json({
      data: sessions.map((session) => ({
        ...session,
        submittedCount: attemptsBySession[String(session._id)] ?? 0,
        participantCount: (session.participants ?? []).length
      }))
    });
  })
);

quizRoutes.post(
  "/start",
  authorize("admin", "instructor"),
  validate(startQuizSchema),
  asyncHandler(async (req, res) => {
    const { day, classRecord } = await getDayForInstructor(req.user!, req.body.dayId);
    const questionQuery: Record<string, unknown> = { classDayId: day._id };
    if (req.body.questionIds.length) questionQuery._id = { $in: req.body.questionIds };
    const questions = await QuizQuestion.find(questionQuery).sort({ createdAt: 1 }).lean();
    if (!questions.length) throw new HttpError(422, "Generate quiz questions before starting the live quiz");

    const participants = await presentStudentsForDay(classRecord.classId, String(day._id));
    if (!participants.length) {
      throw new HttpError(422, "No students are marked present for this class day yet");
    }

    const session = await QuizSession.create({
      classId: classRecord.classId,
      courseId: classRecord.courseId,
      courseTitle: classRecord.courseTitle,
      room: classRecord.room,
      dayId: day._id,
      dayNumber: day.dayNumber,
      dayTitle: day.title,
      status: "open",
      questions: questions.map((question) => ({
        id: String(question._id),
        prompt: question.prompt,
        options: question.options.slice(0, 4),
        correctAnswer: question.correctAnswers?.[0] ?? "",
        explanation: question.explanation ?? "",
        points: Number(question.points ?? 1),
        timeLimitSeconds: Number(question.timeLimitSeconds ?? req.body.timeLimitSeconds)
      })),
      participants,
      timeLimitSeconds: req.body.timeLimitSeconds,
      startedBy: req.user!.id
    });

    await ActivityLog.create({
      userId: req.user!.id,
      action: "quiz_session_started",
      entity: "quiz_session",
      entityId: String(session._id),
      metadata: { classId: classRecord.classId, dayId: String(day._id), participants: participants.length }
    });

    const publicPayload = publicSession(session);
    await Promise.all(
      participants.map(async (student) => {
        const notification = await Notification.create({
          userId: student.studentUserId,
          title: "Live quiz started",
          message: `${classRecord.courseTitle} has a live quiz for ${day.title}.`,
          type: "quiz",
          metadata: { sessionId: session._id, classId: classRecord.classId, dayId: String(day._id) }
        });
        getIo()?.to(`user:${student.studentUserId}`).emit("notification:new", notification);
        getIo()?.to(`user:${student.studentUserId}`).emit("quiz:available", publicPayload);
      })
    );
    getIo()?.to(`user:${req.user!.id}`).emit("quiz:started", { sessionId: String(session._id) });

    res.status(201).json(publicPayload);
  })
);

quizRoutes.get(
  "/student/available",
  authorize("student"),
  asyncHandler(async (req, res) => {
    await getStudentProfile(req.user!);
    const sessions = await QuizSession.find({
      status: "open",
      "participants.studentUserId": req.user!.id
    })
      .sort({ startedAt: -1 })
      .limit(12)
      .lean();
    const attempts = await QuizAttempt.find({ sessionId: { $in: sessions.map((session) => session._id) }, studentUserId: req.user!.id }).lean();
    const attemptBySession = new Map(attempts.map((attempt) => [String(attempt.sessionId), attempt]));
    res.json({ data: sessions.map((session) => publicSession(session, attemptBySession.get(String(session._id)) ?? null)) });
  })
);

quizRoutes.post(
  "/sessions/:id/accept",
  authorize("student"),
  validate(idParamsSchema),
  asyncHandler(async (req, res) => {
    const session = await QuizSession.findById(req.params.id);
    if (!session) throw new HttpError(404, "Quiz session not found");
    if (session.status !== "open") throw new HttpError(422, "This quiz is no longer open");
    const student = await assertStudentCanOpenSession(req.user!, plain(session));

    const existing = await QuizAttempt.findOne({ sessionId: session._id, studentUserId: req.user!.id });
    const attempt =
      existing ??
      (await QuizAttempt.create({
        sessionId: session._id,
        studentId: student.studentId,
        studentUserId: student.studentUserId,
        studentName: student.studentName,
        status: "accepted",
        acceptedAt: new Date()
      }));

    res.status(201).json({ session: publicSession(session, attempt), attempt });
  })
);

quizRoutes.post(
  "/sessions/:id/submit",
  authorize("student"),
  validate(submitQuizSchema),
  asyncHandler(async (req, res) => {
    const session = await QuizSession.findById(req.params.id).lean();
    if (!session) throw new HttpError(404, "Quiz session not found");
    const student = await assertStudentCanOpenSession(req.user!, session);
    const existing = await QuizAttempt.findOne({ sessionId: session._id, studentUserId: req.user!.id });
    if (!existing) throw new HttpError(422, "Accept the quiz before submitting");
    if (existing.status === "submitted") {
      res.json(existing);
      return;
    }

    const scored = scoreAnswers(session, req.body.answers);
    const attempt = await QuizAttempt.findOneAndUpdate(
      { sessionId: session._id, studentUserId: req.user!.id },
      {
        sessionId: session._id,
        studentId: student.studentId,
        studentUserId: student.studentUserId,
        studentName: student.studentName,
        status: "submitted",
        submittedAt: new Date(),
        answers: scored.answers,
        score: scored.score,
        total: scored.total
      },
      { new: true }
    );

    getIo()?.to(`user:${String(session.startedBy)}`).emit("quiz:submitted", {
      sessionId: String(session._id),
      studentName: student.studentName,
      score: scored.score,
      total: scored.total
    });

    res.json(attempt);
  })
);

quizRoutes.get(
  "/sessions/:id/results",
  authorize("admin", "instructor", "student"),
  validate(idParamsSchema),
  asyncHandler(async (req, res) => {
    const session = await QuizSession.findById(req.params.id).lean();
    if (!session) throw new HttpError(404, "Quiz session not found");

    if (req.user!.role === "student") {
      await assertStudentCanOpenSession(req.user!, session);
      const attempt = await QuizAttempt.findOne({ sessionId: session._id, studentUserId: req.user!.id }).lean();
      res.json({ session: publicSession(session, attempt), attempts: attempt ? [attempt] : [] });
      return;
    }

    const classRecord = await getClassRecord(String(session.classId));
    if (req.user!.role === "instructor" && classRecord.instructorUserId !== req.user!.id) {
      throw new HttpError(403, "You can only view quiz results for your assigned classes");
    }

    const attempts = await QuizAttempt.find({ sessionId: session._id }).sort({ score: -1, submittedAt: 1 }).lean();
    res.json({ session, attempts });
  })
);

quizRoutes.patch(
  "/sessions/:id/close",
  authorize("admin", "instructor"),
  validate(idParamsSchema),
  asyncHandler(async (req, res) => {
    const session = await QuizSession.findById(req.params.id);
    if (!session) throw new HttpError(404, "Quiz session not found");
    const classRecord = await getClassRecord(String(session.classId));
    if (req.user!.role === "instructor" && classRecord.instructorUserId !== req.user!.id) {
      throw new HttpError(403, "You can only close quizzes for your assigned classes");
    }
    session.status = "closed";
    session.endedAt = new Date();
    await session.save();
    res.json(session);
  })
);
