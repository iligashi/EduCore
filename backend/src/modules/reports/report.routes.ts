import { Router } from "express";
import { z } from "zod";
import { ActivityLog, Notification } from "../../database/mongo.models.js";
import { rows } from "../../database/mysql.js";
import { authorize } from "../../middleware/authorize.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { getIo } from "../../realtime/socket.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { HttpError } from "../../utils/http-error.js";

export const reportRoutes = Router();

interface SuccessStudentRow {
  studentId: string;
  userId: string;
  fullName: string;
  email: string;
  studentCode: string;
  department: string;
  semester: number;
  status: string;
  attendanceRate: number | null;
  absences: number | null;
  averageGrade: number | null;
  missingSubmissions: number | null;
  lateSubmissions: number | null;
  classNames: string | null;
}

const interventionSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    action: z.enum(["warning", "meeting", "support_plan", "parent_contact", "note"]),
    note: z.string().min(2).max(2000),
    notifyStudent: z.coerce.boolean().default(false)
  })
});

function riskProfile(student: SuccessStudentRow) {
  const attendanceRate = Number(student.attendanceRate ?? 100);
  const averageGrade = student.averageGrade === null || student.averageGrade === undefined ? null : Number(student.averageGrade);
  const missingSubmissions = Number(student.missingSubmissions ?? 0);
  const lateSubmissions = Number(student.lateSubmissions ?? 0);
  const absences = Number(student.absences ?? 0);
  const reasons: string[] = [];
  let score = 0;

  if (attendanceRate < 70) {
    score += 40;
    reasons.push("attendance below 70%");
  } else if (attendanceRate < 80) {
    score += 20;
    reasons.push("attendance below 80%");
  }

  if (averageGrade !== null && averageGrade < 60) {
    score += 30;
    reasons.push("average grade below 60");
  } else if (averageGrade !== null && averageGrade < 70) {
    score += 15;
    reasons.push("average grade below 70");
  }

  if (missingSubmissions > 0) {
    score += Math.min(30, missingSubmissions * 10);
    reasons.push(`${missingSubmissions} missing submission${missingSubmissions === 1 ? "" : "s"}`);
  }

  if (lateSubmissions > 0) {
    score += Math.min(15, lateSubmissions * 5);
    reasons.push(`${lateSubmissions} late submission${lateSubmissions === 1 ? "" : "s"}`);
  }

  if (absences >= 5) {
    score += 10;
    reasons.push(`${absences} absences recorded`);
  }

  const riskLevel = score >= 70 ? "critical" : score >= 45 ? "high" : score >= 20 ? "watch" : "stable";
  return { attendanceRate, averageGrade, missingSubmissions, lateSubmissions, absences, reasons, riskScore: score, riskLevel };
}

async function assertStudentVisible(user: Express.UserClaims, studentId: string) {
  if (user.role === "admin") {
    const [student] = await rows<{ id: string }>("SELECT id FROM students WHERE id = :studentId", { studentId });
    if (!student) throw new HttpError(404, "Student not found");
    return;
  }

  const [student] = await rows<{ id: string }>(
    `SELECT students.id
     FROM students
     JOIN enrollments ON enrollments.student_id = students.id AND enrollments.status = 'active'
     JOIN classes ON classes.id = enrollments.class_id
     JOIN courses ON courses.id = classes.course_id
     JOIN instructors ON instructors.id = courses.instructor_id
     WHERE students.id = :studentId AND instructors.user_id = :userId`,
    { studentId, userId: user.id }
  );
  if (!student) throw new HttpError(403, "You can only manage success records for students in your classes");
}

async function successCenterData(user: Express.UserClaims) {
  const instructorScope = user.role === "instructor";
  const scopedStudents = instructorScope
    ? `AND EXISTS (
         SELECT 1
         FROM enrollments scope_enrollments
         JOIN classes scope_classes ON scope_classes.id = scope_enrollments.class_id
         JOIN courses scope_courses ON scope_courses.id = scope_classes.course_id
         JOIN instructors scope_instructors ON scope_instructors.id = scope_courses.instructor_id
         WHERE scope_enrollments.student_id = students.id
           AND scope_enrollments.status = 'active'
           AND scope_instructors.user_id = :userId
       )`
    : "";
  const scopedAttendance = instructorScope ? "AND instructors.user_id = :userId" : "";
  const scopedAssignments = instructorScope ? "AND instructors.user_id = :userId" : "";

  const data = await rows<SuccessStudentRow>(
    `SELECT students.id AS studentId, students.user_id AS userId,
            users.full_name AS fullName, users.email, students.student_code AS studentCode,
            students.department, students.semester, users.status,
            COALESCE(attendanceStats.attendanceRate, 100) AS attendanceRate,
            COALESCE(attendanceStats.absences, 0) AS absences,
            gradeStats.averageGrade,
            COALESCE(missingStats.missingSubmissions, 0) AS missingSubmissions,
            COALESCE(lateStats.lateSubmissions, 0) AS lateSubmissions,
            (
              SELECT GROUP_CONCAT(DISTINCT CONCAT(courses.title, ' / ', classes.room) ORDER BY courses.title SEPARATOR '; ')
              FROM enrollments
              JOIN classes ON classes.id = enrollments.class_id
              JOIN courses ON courses.id = classes.course_id
              JOIN instructors ON instructors.id = courses.instructor_id
              WHERE enrollments.student_id = students.id
                AND enrollments.status = 'active'
                ${scopedAssignments}
            ) AS classNames
     FROM students
     JOIN users ON users.id = students.user_id
     LEFT JOIN (
       SELECT attendance.student_id,
              ROUND(100 * SUM(CASE WHEN attendance.status IN ('present', 'late', 'excused') THEN 1 ELSE 0 END) / COUNT(*), 0) AS attendanceRate,
              SUM(CASE WHEN attendance.status = 'absent' THEN 1 ELSE 0 END) AS absences
       FROM attendance
       JOIN classes ON classes.id = attendance.class_id
       JOIN courses ON courses.id = classes.course_id
       JOIN instructors ON instructors.id = courses.instructor_id
       WHERE 1 = 1
       ${scopedAttendance}
       GROUP BY attendance.student_id
     ) attendanceStats ON attendanceStats.student_id = students.id
     LEFT JOIN (
       SELECT submissions.student_id, ROUND(AVG(submissions.grade), 2) AS averageGrade
       FROM submissions
       JOIN assignments ON assignments.id = submissions.assignment_id
       JOIN courses ON courses.id = assignments.course_id
       JOIN instructors ON instructors.id = courses.instructor_id
       WHERE submissions.grade IS NOT NULL
       ${scopedAssignments}
       GROUP BY submissions.student_id
     ) gradeStats ON gradeStats.student_id = students.id
     LEFT JOIN (
       SELECT students.id AS studentId, COUNT(DISTINCT assignments.id) - COUNT(DISTINCT submissions.assignment_id) AS missingSubmissions
       FROM students
       JOIN enrollments ON enrollments.student_id = students.id AND enrollments.status = 'active'
       JOIN classes ON classes.id = enrollments.class_id
       JOIN courses ON courses.id = classes.course_id
       JOIN instructors ON instructors.id = courses.instructor_id
       JOIN assignments ON assignments.course_id = classes.course_id
         AND (assignments.class_id IS NULL OR assignments.class_id = classes.id)
       LEFT JOIN submissions ON submissions.assignment_id = assignments.id AND submissions.student_id = students.id
       WHERE assignments.due_date < NOW()
       ${scopedAssignments}
       GROUP BY students.id
     ) missingStats ON missingStats.studentId = students.id
     LEFT JOIN (
       SELECT submissions.student_id, COUNT(*) AS lateSubmissions
       FROM submissions
       JOIN assignments ON assignments.id = submissions.assignment_id
       JOIN courses ON courses.id = assignments.course_id
       JOIN instructors ON instructors.id = courses.instructor_id
       WHERE submissions.submitted_at > assignments.due_date
       ${scopedAssignments}
       GROUP BY submissions.student_id
     ) lateStats ON lateStats.student_id = students.id
     WHERE 1 = 1
     ${scopedStudents}
     ORDER BY users.full_name`,
    { userId: user.id }
  );

  const studentIds = data.map((student) => student.studentId);
  const interventions = studentIds.length
    ? await ActivityLog.find({ entity: "student-success", entityId: { $in: studentIds } }).sort({ createdAt: -1 }).limit(200).lean()
    : [];
  const interventionMap = interventions.reduce<Record<string, typeof interventions>>((grouped, item) => {
    if (!item.entityId) return grouped;
    grouped[item.entityId] = [...(grouped[item.entityId] ?? []), item];
    return grouped;
  }, {});

  return data
    .map((student) => {
      const profile = riskProfile(student);
      const studentInterventions = interventionMap[student.studentId] ?? [];
      return {
        ...student,
        ...profile,
        classNames: student.classNames ?? "",
        interventions: studentInterventions.slice(0, 8),
        interventionCount: studentInterventions.length,
        lastInterventionAt: studentInterventions[0]?.createdAt ?? null
      };
    })
    .sort((left, right) => right.riskScore - left.riskScore || left.fullName.localeCompare(right.fullName));
}

reportRoutes.get(
  "/dashboard",
  authorize("admin"),
  asyncHandler(async (_req, res) => {
    const [[students], [instructors], [courses], [assignments], recentActivity, attendance, performance, riskStudents] = await Promise.all([
      rows<{ total: number }>("SELECT COUNT(*) AS total FROM students"),
      rows<{ total: number }>("SELECT COUNT(*) AS total FROM instructors"),
      rows<{ total: number }>("SELECT COUNT(*) AS total FROM courses"),
      rows<{ total: number }>("SELECT COUNT(*) AS total FROM assignments"),
      ActivityLog.find({}).sort({ createdAt: -1 }).limit(8),
      rows(
        `SELECT status, COUNT(*) AS total
         FROM attendance
         GROUP BY status`
      ),
      rows(
        `SELECT courses.title AS courseTitle, ROUND(AVG(submissions.grade), 2) AS averageGrade
         FROM submissions
         JOIN assignments ON assignments.id = submissions.assignment_id
         JOIN courses ON courses.id = assignments.course_id
         WHERE submissions.grade IS NOT NULL
         GROUP BY courses.title`
      ),
      rows(
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
         WHERE COALESCE(attendanceStats.attendanceRate, 100) < 70
            OR gradeStats.averageGrade < 60
            OR COALESCE(missingStats.missingSubmissions, 0) > 0
         ORDER BY COALESCE(attendanceStats.attendanceRate, 100), gradeStats.averageGrade, missingSubmissions DESC
         LIMIT 10`
      )
    ]);

    res.json({
      totals: {
        students: students.total,
        instructors: instructors.total,
        courses: courses.total,
        assignments: assignments.total
      },
      attendance,
      performance,
      riskStudents,
      recentActivity
    });
  })
);

reportRoutes.get(
  "/success-center",
  authorize("admin", "instructor"),
  asyncHandler(async (req, res) => {
    res.json({ data: await successCenterData(req.user!) });
  })
);

reportRoutes.post(
  "/success-center/:id/interventions",
  authorize("admin", "instructor"),
  validate(interventionSchema),
  asyncHandler(async (req, res) => {
    await assertStudentVisible(req.user!, String(req.params.id));
    const [student] = await rows<{ userId: string; fullName: string }>(
      `SELECT students.user_id AS userId, users.full_name AS fullName
       FROM students
       JOIN users ON users.id = students.user_id
       WHERE students.id = :studentId`,
      { studentId: req.params.id }
    );
    if (!student) throw new HttpError(404, "Student not found");

    const intervention = await ActivityLog.create({
      userId: req.user!.id,
      action: `success_${req.body.action}`,
      entity: "student-success",
      entityId: req.params.id,
      metadata: {
        note: req.body.note,
        action: req.body.action,
        authorName: req.user!.fullName,
        notifyStudent: req.body.notifyStudent
      }
    });

    let notification = null;
    if (req.body.notifyStudent) {
      notification = await Notification.create({
        userId: student.userId,
        title: "Student Success Update",
        message: req.body.note,
        type: "student-success",
        metadata: { studentId: req.params.id, action: req.body.action }
      });
      getIo()?.to(`user:${student.userId}`).emit("notification:new", notification);
    }

    res.status(201).json({ intervention, notification });
  })
);

reportRoutes.get(
  "/instructor-dashboard",
  authorize("instructor"),
  asyncHandler(async (req, res) => {
    const [[courses], [classes], [assignments], [ungraded], attendance, upcoming] = await Promise.all([
      rows<{ total: number }>(
        `SELECT COUNT(*) AS total
         FROM courses
         JOIN instructors ON instructors.id = courses.instructor_id
         WHERE instructors.user_id = :userId`,
        { userId: req.user!.id }
      ),
      rows<{ total: number }>(
        `SELECT COUNT(*) AS total
         FROM classes
         JOIN courses ON courses.id = classes.course_id
         JOIN instructors ON instructors.id = courses.instructor_id
         WHERE instructors.user_id = :userId`,
        { userId: req.user!.id }
      ),
      rows<{ total: number }>(
        `SELECT COUNT(*) AS total
         FROM assignments
         JOIN courses ON courses.id = assignments.course_id
         JOIN instructors ON instructors.id = courses.instructor_id
         WHERE instructors.user_id = :userId`,
        { userId: req.user!.id }
      ),
      rows<{ total: number }>(
        `SELECT COUNT(*) AS total
         FROM submissions
         JOIN assignments ON assignments.id = submissions.assignment_id
         JOIN courses ON courses.id = assignments.course_id
         JOIN instructors ON instructors.id = courses.instructor_id
         WHERE instructors.user_id = :userId AND submissions.grade IS NULL`,
        { userId: req.user!.id }
      ),
      rows(
        `SELECT attendance.status, COUNT(*) AS total
         FROM attendance
         JOIN classes ON classes.id = attendance.class_id
         JOIN courses ON courses.id = classes.course_id
         JOIN instructors ON instructors.id = courses.instructor_id
         WHERE instructors.user_id = :userId
         GROUP BY attendance.status`,
        { userId: req.user!.id }
      ),
      rows(
        `SELECT assignments.id, assignments.title, assignments.due_date AS dueDate, courses.title AS courseTitle
         FROM assignments
         JOIN courses ON courses.id = assignments.course_id
         JOIN instructors ON instructors.id = courses.instructor_id
         WHERE instructors.user_id = :userId
         ORDER BY assignments.due_date ASC
         LIMIT 6`,
        { userId: req.user!.id }
      )
    ]);

    res.json({
      totals: {
        courses: courses.total,
        classes: classes.total,
        assignments: assignments.total,
        ungradedSubmissions: ungraded.total
      },
      attendance,
      upcoming
    });
  })
);

reportRoutes.get(
  "/attendance",
  authorize("admin", "instructor"),
  asyncHandler(async (req, res) => {
    const from = req.query.from ? String(req.query.from) : "1970-01-01";
    const to = req.query.to ? String(req.query.to) : "2999-12-31";
    const instructorFilter = req.user?.role === "instructor" ? "AND instructors.user_id = :userId" : "";
    const data = await rows(
      `SELECT courses.title AS courseTitle, users.full_name AS studentName, attendance.status, COUNT(*) AS total
       FROM attendance
       JOIN students ON students.id = attendance.student_id
       JOIN users ON users.id = students.user_id
       JOIN classes ON classes.id = attendance.class_id
       JOIN courses ON courses.id = classes.course_id
       JOIN instructors ON instructors.id = courses.instructor_id
       WHERE attendance.date BETWEEN :from AND :to
       ${instructorFilter}
       GROUP BY courses.title, users.full_name, attendance.status
       ORDER BY courses.title, users.full_name`,
      { from, to, userId: req.user?.id }
    );
    res.json({ data });
  })
);

reportRoutes.get(
  "/performance",
  authorize("admin", "instructor"),
  asyncHandler(async (req, res) => {
    const instructorFilter = req.user?.role === "instructor" ? "WHERE instructors.user_id = :userId" : "";
    const data = await rows(
      `SELECT students.id AS studentId, users.full_name AS studentName, courses.title AS courseTitle,
              ROUND(AVG(submissions.grade), 2) AS averageGrade,
              COUNT(submissions.id) AS submissions
       FROM submissions
       JOIN students ON students.id = submissions.student_id
       JOIN users ON users.id = students.user_id
       JOIN assignments ON assignments.id = submissions.assignment_id
       JOIN courses ON courses.id = assignments.course_id
       JOIN instructors ON instructors.id = courses.instructor_id
       ${instructorFilter}
       GROUP BY students.id, users.full_name, courses.title
       ORDER BY averageGrade ASC`,
      { userId: req.user?.id }
    );
    res.json({ data });
  })
);

reportRoutes.get(
  "/class-analytics/:id",
  authorize("admin", "instructor"),
  asyncHandler(async (req, res) => {
    const instructorFilter = req.user?.role === "instructor" ? "AND instructors.user_id = :userId" : "";
    const [summary] = await rows(
      `SELECT classes.id, courses.title AS courseTitle, classes.room,
              COUNT(DISTINCT enrollments.student_id) AS enrolledStudents,
              COUNT(DISTINCT assignments.id) AS assignments
       FROM classes
       JOIN courses ON courses.id = classes.course_id
       JOIN instructors ON instructors.id = courses.instructor_id
       LEFT JOIN enrollments ON enrollments.class_id = classes.id
       LEFT JOIN assignments ON assignments.course_id = courses.id
       WHERE classes.id = :id
       ${instructorFilter}
       GROUP BY classes.id, courses.title, classes.room`,
      { id: req.params.id, userId: req.user?.id }
    );
    const attendance = await rows(
      `SELECT attendance.status, COUNT(*) AS total
       FROM attendance
       JOIN classes ON classes.id = attendance.class_id
       JOIN courses ON courses.id = classes.course_id
       JOIN instructors ON instructors.id = courses.instructor_id
       WHERE attendance.class_id = :id
       ${instructorFilter}
       GROUP BY status`,
      { id: req.params.id, userId: req.user?.id }
    );
    res.json({ summary, attendance });
  })
);
