import { Router } from "express";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { ClassDay } from "../../database/mongo.models.js";
import { authorize } from "../../middleware/authorize.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { execute, rows } from "../../database/mysql.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { HttpError } from "../../utils/http-error.js";

export const attendanceRoutes = Router();

const attendanceBody = z.object({
  studentId: z.string().uuid(),
  classId: z.string().uuid(),
  dayId: z.string().min(1),
  status: z.enum(["present", "absent", "late", "excused"]),
  date: z.string().date(),
  notes: z.string().max(255).optional().default("")
});

const attendanceUpdateBody = z.object({
  status: z.enum(["present", "absent", "late", "excused"]),
  notes: z.string().max(255).optional().default("")
});

async function assertClassDayExists(classId: string, dayId: string) {
  const day = await ClassDay.findOne({ _id: dayId, classId });
  if (!day) {
    throw new HttpError(422, "Attendance must be tied to a valid class day");
  }
}

async function assertInstructorCanManageStudent(req: Express.Request, classId: string, studentId: string) {
  if (req.user!.role !== "instructor") return;

  const [record] = await rows<{ id: string }>(
    `SELECT classes.id
     FROM classes
     JOIN courses ON courses.id = classes.course_id
     JOIN instructors ON instructors.id = courses.instructor_id
     JOIN enrollments ON enrollments.class_id = classes.id
     WHERE classes.id = :classId
       AND instructors.user_id = :userId
       AND enrollments.student_id = :studentId`,
    { classId, userId: req.user!.id, studentId }
  );

  if (!record) {
    throw new HttpError(403, "You can only record attendance for students enrolled in your classes");
  }
}

async function assertAttendanceWindow(req: Express.Request, input: { id?: string; studentId?: string; classId?: string; dayId?: string }) {
  if (req.user!.role !== "instructor") return;

  const [record] = input.id
    ? await rows<{ id: string; minutesOld: number }>(
        `SELECT attendance.id, TIMESTAMPDIFF(MINUTE, attendance.created_at, NOW()) AS minutesOld
         FROM attendance
         JOIN classes ON classes.id = attendance.class_id
         JOIN courses ON courses.id = classes.course_id
         JOIN instructors ON instructors.id = courses.instructor_id
         WHERE attendance.id = :id AND instructors.user_id = :userId`,
        { id: input.id, userId: req.user!.id }
      )
    : await rows<{ id: string; minutesOld: number }>(
        `SELECT attendance.id, TIMESTAMPDIFF(MINUTE, attendance.created_at, NOW()) AS minutesOld
         FROM attendance
         JOIN classes ON classes.id = attendance.class_id
         JOIN courses ON courses.id = classes.course_id
         JOIN instructors ON instructors.id = courses.instructor_id
         WHERE attendance.student_id = :studentId
           AND attendance.class_id = :classId
           AND attendance.class_day_id = :dayId
           AND instructors.user_id = :userId`,
        { studentId: input.studentId, classId: input.classId, dayId: input.dayId, userId: req.user!.id }
      );

  if (record && Number(record.minutesOld) > 120) {
    throw new HttpError(403, "Attendance edit window is closed after 2 hours");
  }
}

attendanceRoutes.get(
  "/",
  authorize("admin", "instructor"),
  asyncHandler(async (req, res) => {
    const instructorFilter = req.user?.role === "instructor" ? "AND instructors.user_id = :userId" : "";
    const data = await rows(
      `SELECT attendance.id, attendance.student_id AS studentId, attendance.class_id AS classId,
              attendance.class_day_id AS dayId, attendance.status, attendance.date, attendance.notes,
              attendance.created_at AS createdAt,
              DATE_ADD(attendance.created_at, INTERVAL 2 HOUR) AS editableUntil,
              CASE WHEN TIMESTAMPDIFF(MINUTE, attendance.created_at, NOW()) <= 120 THEN 1 ELSE 0 END AS isEditable,
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
    await assertClassDayExists(req.body.classId, req.body.dayId);
    await assertInstructorCanManageStudent(req, req.body.classId, req.body.studentId);
    await assertAttendanceWindow(req, req.body);

    const id = uuid();
    await execute(
      `INSERT INTO attendance (id, student_id, class_id, class_day_id, status, date, notes)
       VALUES (:id, :studentId, :classId, :dayId, :status, :date, :notes)
       ON DUPLICATE KEY UPDATE status = VALUES(status), notes = VALUES(notes)`,
      {
        id,
        studentId: req.body.studentId,
        classId: req.body.classId,
        dayId: req.body.dayId,
        status: req.body.status,
        date: req.body.date,
        notes: req.body.notes
      }
    );
    res.status(201).json({ id, ...req.body });
  })
);

attendanceRoutes.put(
  "/:id",
  authorize("admin", "instructor"),
  validate(z.object({ params: z.object({ id: z.string().uuid() }), body: attendanceUpdateBody })),
  asyncHandler(async (req, res) => {
    await assertAttendanceWindow(req, { id: String(req.params.id) });
    await execute(
      `UPDATE attendance
       SET status = :status, notes = :notes
       WHERE id = :id`,
      { id: req.params.id, status: req.body.status, notes: req.body.notes }
    );
    const [updated] = await rows("SELECT * FROM attendance WHERE id = :id", { id: req.params.id });
    res.json(updated);
  })
);

attendanceRoutes.post(
  "/bulk",
  authorize("admin", "instructor"),
  validate(
    z.object({
      body: z.object({
        classId: z.string().uuid(),
        dayId: z.string().min(1),
        date: z.string().date(),
        records: z.array(
          z.object({
            studentId: z.string().uuid(),
            status: z.enum(["present", "absent", "late", "excused"]),
            notes: z.string().max(255).optional().default("")
          })
        )
      })
    })
  ),
  asyncHandler(async (req, res) => {
    await assertClassDayExists(req.body.classId, req.body.dayId);
    for (const record of req.body.records) {
      await assertInstructorCanManageStudent(req, req.body.classId, record.studentId);
      await assertAttendanceWindow(req, {
        studentId: record.studentId,
        classId: req.body.classId,
        dayId: req.body.dayId
      });
      await execute(
        `INSERT INTO attendance (id, student_id, class_id, class_day_id, status, date, notes)
         VALUES (:id, :studentId, :classId, :dayId, :status, :date, :notes)
         ON DUPLICATE KEY UPDATE status = VALUES(status), notes = VALUES(notes)`,
        {
          id: uuid(),
          studentId: record.studentId,
          classId: req.body.classId,
          dayId: req.body.dayId,
          status: record.status,
          date: req.body.date,
          notes: record.notes
        }
      );
    }
    res.status(201).json({ saved: req.body.records.length });
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
