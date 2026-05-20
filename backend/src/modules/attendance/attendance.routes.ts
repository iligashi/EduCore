import { Router } from "express";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { authorize } from "../../middleware/authorize.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { execute, rows } from "../../database/mysql.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { HttpError } from "../../utils/http-error.js";

export const attendanceRoutes = Router();

const attendanceBody = z.object({
  studentId: z.string().uuid(),
  classId: z.string().uuid(),
  status: z.enum(["present", "absent", "late", "excused"]),
  date: z.string().date(),
  notes: z.string().max(255).optional().default("")
});

attendanceRoutes.get(
  "/",
  authorize("admin", "instructor"),
  asyncHandler(async (req, res) => {
    const instructorFilter = req.user?.role === "instructor" ? "AND instructors.user_id = :userId" : "";
    const data = await rows(
      `SELECT attendance.id, attendance.student_id AS studentId, attendance.class_id AS classId,
              attendance.status, attendance.date, attendance.notes,
              users.full_name AS studentName, courses.title AS courseTitle, classes.room
       FROM attendance
       JOIN students ON students.id = attendance.student_id
       JOIN users ON users.id = students.user_id
       JOIN classes ON classes.id = attendance.class_id
       JOIN courses ON courses.id = classes.course_id
       JOIN instructors ON instructors.id = courses.instructor_id
       WHERE 1 = 1
       ${instructorFilter}
       ORDER BY attendance.date DESC, users.full_name`,
      { userId: req.user?.id }
    );
    res.json({ data });
  })
);

attendanceRoutes.post(
  "/",
  authorize("admin", "instructor"),
  validate(z.object({ body: attendanceBody })),
  asyncHandler(async (req, res) => {
    if (req.user!.role === "instructor") {
      const [record] = await rows<{ id: string }>(
        `SELECT classes.id
         FROM classes
         JOIN courses ON courses.id = classes.course_id
         JOIN instructors ON instructors.id = courses.instructor_id
         JOIN enrollments ON enrollments.class_id = classes.id
         WHERE classes.id = :classId
           AND instructors.user_id = :userId
           AND enrollments.student_id = :studentId`,
        { classId: req.body.classId, userId: req.user!.id, studentId: req.body.studentId }
      );

      if (!record) {
        throw new HttpError(403, "You can only record attendance for students enrolled in your classes");
      }
    }

    const id = uuid();
    await execute(
      `INSERT INTO attendance (id, student_id, class_id, status, date, notes)
       VALUES (:id, :studentId, :classId, :status, :date, :notes)
       ON DUPLICATE KEY UPDATE status = VALUES(status), notes = VALUES(notes)`,
      {
        id,
        studentId: req.body.studentId,
        classId: req.body.classId,
        status: req.body.status,
        date: req.body.date,
        notes: req.body.notes
      }
    );
    res.status(201).json({ id, ...req.body });
  })
);

attendanceRoutes.get(
  "/summary",
  authorize("admin", "instructor"),
  asyncHandler(async (req, res) => {
    const instructorFilter = req.user?.role === "instructor" ? "WHERE instructors.user_id = :userId" : "";
    const data = await rows(
      `SELECT courses.title AS courseTitle, attendance.status, COUNT(*) AS total
       FROM attendance
       JOIN classes ON classes.id = attendance.class_id
       JOIN courses ON courses.id = classes.course_id
       JOIN instructors ON instructors.id = courses.instructor_id
       ${instructorFilter}
       GROUP BY courses.title, attendance.status
       ORDER BY courses.title, attendance.status`,
      { userId: req.user?.id }
    );
    res.json({ data });
  })
);
