import { Router } from "express";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { ActivityLog, ClassDay, Notification } from "../../database/mongo.models.js";
import { execute, rows } from "../../database/mysql.js";
import { authorize } from "../../middleware/authorize.middleware.js";
import { upload } from "../../middleware/upload.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { getIo } from "../../realtime/socket.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { HttpError } from "../../utils/http-error.js";
import { getPagination } from "../../utils/pagination.js";
import { idParamsSchema } from "../../utils/schemas.js";

export const assignmentRoutes = Router();

const assignmentBody = z.object({
  courseId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  dayId: z.string().optional(),
  title: z.string().min(2).max(180),
  description: z.string().max(5000).optional().default(""),
  dueDate: z.string().datetime(),
  points: z.coerce.number().int().min(1).max(1000).default(100)
});

interface ClassHealthRow {
  classId: string;
  courseTitle: string;
  room: string;
  instructorUserId: string;
  instructorName: string;
}

interface DayAssignmentStats {
  dayId: string | null;
  assignments: number;
  submissions: number;
  gradedSubmissions: number;
  ungradedSubmissions: number;
}

async function currentStudentId(userId: string) {
  const [student] = await rows<{ id: string }>("SELECT id FROM students WHERE user_id = :userId", { userId });
  if (!student) throw new HttpError(403, "Student profile not found");
  return student.id;
}

async function assertCourseWritable(user: Express.UserClaims, courseId: string) {
  if (user.role === "admin") return;

  const [course] = await rows<{ id: string }>(
    `SELECT courses.id
     FROM courses
     JOIN instructors ON instructors.id = courses.instructor_id
     WHERE courses.id = :courseId AND instructors.user_id = :userId`,
    { courseId, userId: user.id }
  );

  if (!course) {
    throw new HttpError(403, "You can only manage assignments for your own courses");
  }
}

async function assertClassWritable(user: Express.UserClaims, classId: string) {
  const [classRecord] = await rows<{ id: string; courseId: string; instructorUserId: string }>(
    `SELECT classes.id, classes.course_id AS courseId, instructors.user_id AS instructorUserId
     FROM classes
     JOIN courses ON courses.id = classes.course_id
     JOIN instructors ON instructors.id = courses.instructor_id
     WHERE classes.id = :classId`,
    { classId }
  );

  if (!classRecord) throw new HttpError(404, "Class not found");
  if (user.role !== "admin" && classRecord.instructorUserId !== user.id) {
    throw new HttpError(403, "You can only manage assignments inside classes assigned to you");
  }

  return classRecord;
}

async function assertDayBelongsToClass(dayId: string, classId: string) {
  const day = await ClassDay.findOne({ _id: dayId, classId });
  if (!day) throw new HttpError(422, "Selected day does not belong to this class");
}

async function assertAssignmentWritable(user: Express.UserClaims, assignmentId: string) {
  if (user.role === "admin") return;

  const [assignment] = await rows<{ id: string }>(
    `SELECT assignments.id
     FROM assignments
     JOIN courses ON courses.id = assignments.course_id
     JOIN instructors ON instructors.id = courses.instructor_id
     WHERE assignments.id = :assignmentId AND instructors.user_id = :userId`,
    { assignmentId, userId: user.id }
  );

  if (!assignment) {
    throw new HttpError(403, "You can only manage assignments for your own courses");
  }
}

async function getClassHealth(classId?: string) {
  const classFilter = classId ? "WHERE classes.id = :classId" : "";
  const classRecords = await rows<ClassHealthRow>(
    `SELECT classes.id AS classId, courses.title AS courseTitle, classes.room,
            instructors.user_id AS instructorUserId, users.full_name AS instructorName
     FROM classes
     JOIN courses ON courses.id = classes.course_id
     JOIN instructors ON instructors.id = courses.instructor_id
     JOIN users ON users.id = instructors.user_id
     ${classFilter}
     ORDER BY courses.title, classes.room`,
    { classId }
  );

  return Promise.all(
    classRecords.map(async (classRecord) => {
      const days = await ClassDay.find({ classId: classRecord.classId }).sort({ dayNumber: 1, createdAt: 1 }).lean();
      const assignmentStats = await rows<DayAssignmentStats>(
        `SELECT assignments.class_day_id AS dayId,
                COUNT(DISTINCT assignments.id) AS assignments,
                COUNT(submissions.id) AS submissions,
                SUM(CASE WHEN submissions.id IS NOT NULL AND submissions.grade IS NOT NULL THEN 1 ELSE 0 END) AS gradedSubmissions,
                SUM(CASE WHEN submissions.id IS NOT NULL AND submissions.grade IS NULL THEN 1 ELSE 0 END) AS ungradedSubmissions
         FROM assignments
         LEFT JOIN submissions ON submissions.assignment_id = assignments.id
         WHERE assignments.class_id = :classId
         GROUP BY assignments.class_day_id`,
        { classId: classRecord.classId }
      );
      const statsByDay = new Map(assignmentStats.map((item) => [item.dayId, item]));
      const dayHealth = days.map((day) => {
        const dayId = String(day._id);
        const stats = statsByDay.get(dayId);
        return {
          dayId,
          dayNumber: day.dayNumber,
          title: day.title,
          published: day.published,
          assignments: Number(stats?.assignments ?? 0),
          submissions: Number(stats?.submissions ?? 0),
          gradedSubmissions: Number(stats?.gradedSubmissions ?? 0),
          ungradedSubmissions: Number(stats?.ungradedSubmissions ?? 0)
        };
      });
      const unlinkedStats = statsByDay.get(null);
      const totalAssignments = assignmentStats.reduce((total, item) => total + Number(item.assignments ?? 0), 0);
      const totalSubmissions = assignmentStats.reduce((total, item) => total + Number(item.submissions ?? 0), 0);
      const gradedSubmissions = assignmentStats.reduce((total, item) => total + Number(item.gradedSubmissions ?? 0), 0);
      const ungradedSubmissions = assignmentStats.reduce((total, item) => total + Number(item.ungradedSubmissions ?? 0), 0);

      return {
        ...classRecord,
        totalDays: days.length,
        assignmentDays: assignmentStats.filter((item) => item.dayId).length,
        gradedDays: assignmentStats.filter((item) => item.dayId && Number(item.gradedSubmissions ?? 0) > 0).length,
        ungradedDays: assignmentStats.filter((item) => item.dayId && Number(item.ungradedSubmissions ?? 0) > 0).length,
        totalAssignments,
        totalSubmissions,
        gradedSubmissions,
        ungradedSubmissions,
        unlinkedAssignments: Number(unlinkedStats?.assignments ?? 0),
        days: dayHealth
      };
    })
  );
}

async function assertStudentCanSubmit(studentId: string, assignmentId: string) {
  const [assignment] = await rows<{ id: string }>(
    `SELECT assignments.id
     FROM assignments
     JOIN classes ON classes.course_id = assignments.course_id
     JOIN enrollments ON enrollments.class_id = classes.id
     WHERE assignments.id = :assignmentId
       AND enrollments.student_id = :studentId
       AND (assignments.class_id IS NULL OR assignments.class_id = enrollments.class_id)`,
    { assignmentId, studentId }
  );

  if (!assignment) {
    throw new HttpError(403, "Students can only submit assignments for enrolled courses");
  }
}

assignmentRoutes.get(
  "/",
  asyncHandler(async (req, res) => {
    const { pageSize, offset, page } = getPagination(req.query);
    const search = `%${String(req.query.search ?? "")}%`;
    const studentFilter =
      req.user?.role === "student"
        ? `AND EXISTS (
             SELECT 1 FROM enrollments
             JOIN classes ON classes.id = enrollments.class_id
             JOIN students ON students.id = enrollments.student_id
             WHERE classes.course_id = assignments.course_id
               AND students.user_id = :userId
               AND (assignments.class_id IS NULL OR assignments.class_id = classes.id)
           )`
        : "";
    const instructorFilter = req.user?.role === "instructor" ? "AND instructors.user_id = :userId" : "";

    const data = await rows(
      `SELECT assignments.id, assignments.course_id AS courseId, assignments.class_id AS classId,
              assignments.class_day_id AS dayId, assignments.title, assignments.description,
              assignments.due_date AS dueDate, assignments.points, courses.title AS courseTitle,
              classes.room AS classRoom, users.full_name AS instructorName
       FROM assignments
       JOIN courses ON courses.id = assignments.course_id
       LEFT JOIN classes ON classes.id = assignments.class_id
       JOIN instructors ON instructors.id = courses.instructor_id
       JOIN users ON users.id = instructors.user_id
       WHERE (assignments.title LIKE :search OR courses.title LIKE :search)
       ${studentFilter}
       ${instructorFilter}
       ORDER BY assignments.due_date ASC
       LIMIT :pageSize OFFSET :offset`,
      { search, pageSize, offset, userId: req.user?.id }
    );
    const [count] = await rows<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM assignments
       JOIN courses ON courses.id = assignments.course_id
       JOIN instructors ON instructors.id = courses.instructor_id
       WHERE (assignments.title LIKE :search OR courses.title LIKE :search)
       ${studentFilter}
       ${instructorFilter}`,
      { search, userId: req.user?.id }
    );
    res.json({ data, meta: { page, pageSize, total: count.total } });
  })
);

assignmentRoutes.get(
  "/class-health",
  authorize("admin"),
  asyncHandler(async (_req, res) => {
    res.json({ data: await getClassHealth() });
  })
);

assignmentRoutes.post(
  "/class-health/:id/notify-ungraded",
  authorize("admin"),
  validate(idParamsSchema),
  asyncHandler(async (req, res) => {
    const [health] = await getClassHealth(String(req.params.id));
    if (!health) throw new HttpError(404, "Class not found");
    if (health.ungradedSubmissions <= 0) {
      throw new HttpError(422, "This class has no ungraded submissions");
    }

    const notification = await Notification.create({
      userId: health.instructorUserId,
      title: "Ungraded submissions reminder",
      message: `${health.courseTitle} / ${health.room} has ${health.ungradedSubmissions} ungraded submission${health.ungradedSubmissions === 1 ? "" : "s"}. Please review the pending work.`,
      type: "grading-reminder"
    });
    getIo()?.to(`user:${health.instructorUserId}`).emit("notification:new", notification);
    res.status(201).json(notification);
  })
);

assignmentRoutes.post(
  "/",
  authorize("admin", "instructor"),
  validate(z.object({ body: assignmentBody })),
  asyncHandler(async (req, res) => {
    if (req.user!.role === "instructor" && (!req.body.classId || !req.body.dayId)) {
      throw new HttpError(422, "Instructors must create assignments inside an assigned class day");
    }

    let courseId = req.body.courseId;
    if (req.body.classId) {
      const classRecord = await assertClassWritable(req.user!, req.body.classId);
      courseId = classRecord.courseId;
      if (req.body.dayId) await assertDayBelongsToClass(req.body.dayId, req.body.classId);
    }

    if (!courseId) throw new HttpError(422, "courseId is required unless classId is provided");
    if (!req.body.classId) await assertCourseWritable(req.user!, courseId);

    const id = uuid();
    await execute(
      `INSERT INTO assignments (id, course_id, class_id, class_day_id, title, description, due_date, points)
       VALUES (:id, :courseId, :classId, :dayId, :title, :description, :dueDate, :points)`,
      {
        id,
        courseId,
        classId: req.body.classId ?? null,
        dayId: req.body.dayId ?? null,
        title: req.body.title,
        description: req.body.description,
        dueDate: req.body.dueDate.replace("T", " ").replace("Z", ""),
        points: req.body.points
      }
    );

    const notification = await Notification.create({
      role: "student",
      title: "New assignment",
      message: `${req.body.title} is now available.`,
      type: "assignment",
      metadata: {
        assignmentId: id,
        courseId,
        classId: req.body.classId ?? null,
        dayId: req.body.dayId ?? null,
        dueDate: req.body.dueDate
      }
    });
    getIo()?.to("role:student").emit("notification:new", notification);

    await ActivityLog.create({
      userId: req.user!.id,
      action: "assignment_created",
      entity: "assignment",
      entityId: id,
      metadata: { title: req.body.title, courseId, classId: req.body.classId ?? null, dueDate: req.body.dueDate }
    });

    const [assignment] = await rows("SELECT * FROM assignments WHERE id = :id", { id });
    res.status(201).json(assignment);
  })
);

assignmentRoutes.put(
  "/:id",
  authorize("admin", "instructor"),
  validate(idParamsSchema.extend({ body: assignmentBody.partial() })),
  asyncHandler(async (req, res) => {
    await assertAssignmentWritable(req.user!, String(req.params.id));
    if (req.body.courseId) {
      await assertCourseWritable(req.user!, req.body.courseId);
    }
    if (req.body.classId) {
      const classRecord = await assertClassWritable(req.user!, req.body.classId);
      req.body.courseId = classRecord.courseId;
      if (req.body.dayId) await assertDayBelongsToClass(req.body.dayId, req.body.classId);
    }
    await execute(
      `UPDATE assignments
       SET course_id = COALESCE(:courseId, course_id),
           class_id = COALESCE(:classId, class_id),
           class_day_id = COALESCE(:dayId, class_day_id),
           title = COALESCE(:title, title),
           description = COALESCE(:description, description),
           due_date = COALESCE(:dueDate, due_date),
           points = COALESCE(:points, points)
       WHERE id = :id`,
      {
        id: req.params.id,
        courseId: req.body.courseId ?? null,
        classId: req.body.classId ?? null,
        dayId: req.body.dayId ?? null,
        title: req.body.title,
        description: req.body.description,
        dueDate: req.body.dueDate ? req.body.dueDate.replace("T", " ").replace("Z", "") : null,
        points: req.body.points
      }
    );
    const [assignment] = await rows("SELECT * FROM assignments WHERE id = :id", { id: req.params.id });
    res.json(assignment);
  })
);

assignmentRoutes.delete(
  "/:id",
  authorize("admin"),
  validate(idParamsSchema),
  asyncHandler(async (req, res) => {
    await execute("DELETE FROM assignments WHERE id = :id", { id: req.params.id });
    res.status(204).send();
  })
);

assignmentRoutes.get(
  "/submissions",
  asyncHandler(async (req, res) => {
    const studentFilter = req.user?.role === "student" ? "AND students.user_id = :userId" : "";
    const instructorFilter = req.user?.role === "instructor" ? "AND instructors.user_id = :userId" : "";
    const data = await rows(
      `SELECT submissions.id, submissions.assignment_id AS assignmentId, submissions.student_id AS studentId,
              submissions.file_url AS fileUrl, submissions.notes, submissions.grade, submissions.feedback,
              submissions.submitted_at AS submittedAt, submissions.graded_at AS gradedAt,
              assignments.title AS assignmentTitle, assignments.class_id AS classId, assignments.class_day_id AS dayId,
              users.full_name AS studentName, courses.title AS courseTitle, classes.room AS classRoom
       FROM submissions
       JOIN assignments ON assignments.id = submissions.assignment_id
       JOIN courses ON courses.id = assignments.course_id
       JOIN instructors ON instructors.id = courses.instructor_id
       LEFT JOIN classes ON classes.id = assignments.class_id
       JOIN students ON students.id = submissions.student_id
       JOIN users ON users.id = students.user_id
       WHERE 1 = 1
       ${studentFilter}
       ${instructorFilter}
       ORDER BY submissions.submitted_at DESC`,
      { userId: req.user?.id }
    );
    res.json({ data });
  })
);

assignmentRoutes.post(
  "/submissions",
  authorize("student", "admin"),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({
        assignmentId: z.string().uuid(),
        studentId: z.string().uuid().optional(),
        notes: z.string().max(2000).optional()
      })
      .parse(req.body);

    const studentId = req.user!.role === "student" ? await currentStudentId(req.user!.id) : parsed.studentId;
    if (!studentId) throw new HttpError(422, "studentId is required for admin submissions");
    await assertStudentCanSubmit(studentId, parsed.assignmentId);

    const fileUrl = req.file ? `/uploads/${req.file.filename}` : String(req.body.fileUrl ?? "");
    if (!fileUrl) throw new HttpError(422, "Submission file is required");

    const id = uuid();
    await execute(
      `INSERT INTO submissions (id, assignment_id, student_id, file_url, notes)
       VALUES (:id, :assignmentId, :studentId, :fileUrl, :notes)
       ON DUPLICATE KEY UPDATE file_url = VALUES(file_url), notes = VALUES(notes), submitted_at = CURRENT_TIMESTAMP`,
      {
        id,
        assignmentId: parsed.assignmentId,
        studentId,
        fileUrl,
        notes: parsed.notes ?? ""
      }
    );

    const [assignment] = await rows<{ instructorUserId: string; title: string; dueDate: string; studentName: string }>(
      `SELECT instructors.user_id AS instructorUserId, assignments.title, assignments.due_date AS dueDate,
              users.full_name AS studentName
       FROM assignments
       JOIN courses ON courses.id = assignments.course_id
       JOIN instructors ON instructors.id = courses.instructor_id
       JOIN students ON students.id = :studentId
       JOIN users ON users.id = students.user_id
       WHERE assignments.id = :assignmentId`,
      { assignmentId: parsed.assignmentId, studentId }
    );
    if (assignment) {
      const submittedLate = new Date() > new Date(assignment.dueDate);
      const notification = await Notification.create({
        userId: assignment.instructorUserId,
        title: "New submission",
        message: `${assignment.studentName} submitted ${assignment.title}${submittedLate ? " after the deadline" : ""}.`,
        type: "submission",
        metadata: { assignmentId: parsed.assignmentId, studentId, submittedLate }
      });
      getIo()?.to(`user:${assignment.instructorUserId}`).emit("notification:new", notification);
      getIo()?.to(`user:${assignment.instructorUserId}`).emit("submission:new", {
        assignmentId: parsed.assignmentId,
        title: assignment.title,
        studentId
      });
      await ActivityLog.create({
        userId: req.user!.id,
        action: submittedLate ? "late_submission_uploaded" : "submission_uploaded",
        entity: "submission",
        entityId: id,
        metadata: { assignmentId: parsed.assignmentId, studentId, submittedLate }
      });
    }

    res.status(201).json({ id, assignmentId: parsed.assignmentId, studentId, fileUrl, notes: parsed.notes ?? "" });
  })
);

assignmentRoutes.put(
  "/submissions/:id/grade",
  authorize("instructor"),
  validate(
    z.object({
      params: z.object({ id: z.string().uuid() }),
      body: z.object({
        grade: z.coerce.number().min(0).max(1000),
        feedback: z.string().max(5000).optional().default("")
      })
    })
  ),
  asyncHandler(async (req, res) => {
    if (req.user!.role === "instructor") {
      const [submission] = await rows<{ id: string }>(
        `SELECT submissions.id
         FROM submissions
         JOIN assignments ON assignments.id = submissions.assignment_id
         JOIN courses ON courses.id = assignments.course_id
         JOIN instructors ON instructors.id = courses.instructor_id
         WHERE submissions.id = :id AND instructors.user_id = :userId`,
        { id: req.params.id, userId: req.user!.id }
      );
      if (!submission) {
        throw new HttpError(403, "You can only grade submissions for your own courses");
      }
    }

    const [submissionForGrade] = await rows<{
      assignmentId: string;
      studentId: string;
      studentUserId: string;
      assignmentTitle: string;
      dueDate: string;
      submittedAt: string;
    }>(
      `SELECT submissions.assignment_id AS assignmentId, submissions.student_id AS studentId,
              students.user_id AS studentUserId, assignments.title AS assignmentTitle,
              assignments.due_date AS dueDate, submissions.submitted_at AS submittedAt
       FROM submissions
       JOIN students ON students.id = submissions.student_id
       JOIN assignments ON assignments.id = submissions.assignment_id
       WHERE submissions.id = :id`,
      { id: req.params.id }
    );
    if (!submissionForGrade) throw new HttpError(404, "Submission not found");

    const submittedLate = new Date(submissionForGrade.submittedAt) > new Date(submissionForGrade.dueDate);
    const finalGrade = submittedLate ? Math.max(0, Math.round(Number(req.body.grade) * 0.9 * 100) / 100) : Number(req.body.grade);
    const feedback = submittedLate
      ? `${req.body.feedback ? `${req.body.feedback}\n\n` : ""}Automatic late penalty applied: 10% deducted.`
      : req.body.feedback;

    await execute(
      `UPDATE submissions
       SET grade = :grade, feedback = :feedback, graded_at = CURRENT_TIMESTAMP
       WHERE id = :id`,
      { id: req.params.id, grade: finalGrade, feedback }
    );

    const notification = await Notification.create({
      userId: submissionForGrade.studentUserId,
      title: "Grade updated",
      message: `${submissionForGrade.assignmentTitle} has been graded${submittedLate ? " with an automatic late penalty" : ""}.`,
      type: "grade",
      metadata: {
        assignmentId: submissionForGrade.assignmentId,
        submissionId: req.params.id,
        submittedLate,
        originalGrade: Number(req.body.grade),
        finalGrade
      }
    });
    getIo()?.to(`user:${submissionForGrade.studentUserId}`).emit("notification:new", notification);

    await ActivityLog.create({
      userId: req.user!.id,
      action: submittedLate ? "submission_graded_with_late_penalty" : "submission_graded",
      entity: "submission",
      entityId: String(req.params.id),
      metadata: {
        assignmentId: submissionForGrade.assignmentId,
        studentId: submissionForGrade.studentId,
        submittedLate,
        originalGrade: Number(req.body.grade),
        finalGrade
      }
    });

    const [updated] = await rows("SELECT * FROM submissions WHERE id = :id", { id: req.params.id });
    res.json(updated);
  })
);
