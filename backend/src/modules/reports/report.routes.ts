import { Router } from "express";
import { ActivityLog } from "../../database/mongo.models.js";
import { rows } from "../../database/mysql.js";
import { authorize } from "../../middleware/authorize.middleware.js";
import { asyncHandler } from "../../utils/async-handler.js";

export const reportRoutes = Router();

reportRoutes.get(
  "/dashboard",
  authorize("admin"),
  asyncHandler(async (_req, res) => {
    const [[students], [instructors], [courses], [assignments], recentActivity, attendance, performance] = await Promise.all([
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
      recentActivity
    });
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
