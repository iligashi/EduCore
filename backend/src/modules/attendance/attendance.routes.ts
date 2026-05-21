import { Router } from "express";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { ActivityLog, ClassDay, Notification } from "../../database/mongo.models.js";
import { authorize } from "../../middleware/authorize.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { execute, rows } from "../../database/mysql.js";
import { getIo } from "../../realtime/socket.js";
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

interface AttendanceSessionRow {
  classId: string;
  dayId: string;
  date: string;
  startedAt: string;
  totalMarked: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
}

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

async function maybeRunAttendanceAutomations(studentId: string, classId: string) {
  const latest = await rows<{ id: string; status: string }>(
    `SELECT id, status
     FROM attendance
     WHERE student_id = :studentId AND class_id = :classId
     ORDER BY date DESC, created_at DESC
     LIMIT 5`,
    { studentId, classId }
  );

  const [student] = await rows<{ userId: string; studentName: string; courseTitle: string }>(
    `SELECT students.user_id AS userId, users.full_name AS studentName, courses.title AS courseTitle
     FROM students
     JOIN users ON users.id = students.user_id
     JOIN classes ON classes.id = :classId
     JOIN courses ON courses.id = classes.course_id
     WHERE students.id = :studentId`,
    { studentId, classId }
  );
  if (!student) return;

  const latestThree = latest.slice(0, 3);
  if (latestThree.length === 3 && latestThree.every((record) => record.status === "absent")) {
    const streakKey = latestThree.map((record) => record.id).join(":");
    const existing = await Notification.findOne({
      userId: student.userId,
      type: "attendance-warning",
      "metadata.classId": classId
    });
    if (!existing) {
      const notification = await Notification.create({
        userId: student.userId,
        title: "Attendance warning",
        message: `You have been missing the last three hours in ${student.courseTitle}.`,
        type: "attendance-warning",
        metadata: { classId, streakKey }
      });
      getIo()?.to(`user:${student.userId}`).emit("notification:new", notification);
    }
  }

  if (latest.length === 5 && latest.every((record) => record.status === "absent")) {
    const streakKey = latest.map((record) => record.id).join(":");
    const existing = await Notification.findOne({
      role: "admin",
      type: "attendance-escalation",
      "metadata.classId": classId,
      "metadata.studentId": studentId
    });
    if (!existing) {
      const notification = await Notification.create({
        role: "admin",
        title: "Attendance escalation",
        message: `${student.studentName} has missed the last five attendance hours in ${student.courseTitle}.`,
        type: "attendance-escalation",
        metadata: { classId, studentId, streakKey }
      });
      getIo()?.to("role:admin").emit("notification:new", notification);
    }
  }

  const [summary] = await rows<{ total: number; attended: number }>(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN status IN ('present', 'late', 'excused') THEN 1 ELSE 0 END) AS attended
     FROM attendance
     WHERE student_id = :studentId AND class_id = :classId`,
    { studentId, classId }
  );
  const total = Number(summary?.total ?? 0);
  const attended = Number(summary?.attended ?? 0);
  const attendanceRate = total ? Math.round((attended / total) * 100) : 100;
  if (total >= 3 && attendanceRate < 70) {
    const existingStudentWarning = await Notification.findOne({
      userId: student.userId,
      type: "attendance-risk",
      "metadata.classId": classId
    });
    if (!existingStudentWarning) {
      const notification = await Notification.create({
        userId: student.userId,
        title: "Attendance risk",
        message: `Your attendance in ${student.courseTitle} dropped below 70%. Current attendance is ${attendanceRate}%.`,
        type: "attendance-risk",
        metadata: { classId, attendanceRate }
      });
      getIo()?.to(`user:${student.userId}`).emit("notification:new", notification);
    }

    const existingAdminWarning = await Notification.findOne({
      role: "admin",
      type: "student-at-risk",
      "metadata.classId": classId,
      "metadata.studentId": studentId
    });
    if (!existingAdminWarning) {
      const notification = await Notification.create({
        role: "admin",
        title: "Student at risk",
        message: `${student.studentName} attendance in ${student.courseTitle} is ${attendanceRate}%.`,
        type: "student-at-risk",
        metadata: { classId, studentId, attendanceRate }
      });
      getIo()?.to("role:admin").emit("notification:new", notification);
    }
  }
}

async function getAttendanceHealth(user: Express.UserClaims) {
  const instructorFilter = user.role === "instructor" ? "AND instructors.user_id = :userId" : "";
  const classRecords = await rows<{
    classId: string;
    courseTitle: string;
    room: string;
    instructorName: string;
    totalStudents: number;
  }>(
    `SELECT classes.id AS classId, courses.title AS courseTitle, classes.room,
            users.full_name AS instructorName,
            COUNT(DISTINCT enrollments.student_id) AS totalStudents
     FROM classes
     JOIN courses ON courses.id = classes.course_id
     JOIN instructors ON instructors.id = courses.instructor_id
     JOIN users ON users.id = instructors.user_id
     LEFT JOIN enrollments ON enrollments.class_id = classes.id AND enrollments.status = 'active'
     WHERE 1 = 1
     ${instructorFilter}
     GROUP BY classes.id, courses.title, classes.room, users.full_name
     ORDER BY courses.title, classes.room`,
    { userId: user.id }
  );

  const sessions = await rows<AttendanceSessionRow>(
    `SELECT attendance.class_id AS classId, attendance.class_day_id AS dayId, attendance.date,
            MIN(attendance.created_at) AS startedAt,
            COUNT(*) AS totalMarked,
            SUM(CASE WHEN attendance.status = 'present' THEN 1 ELSE 0 END) AS present,
            SUM(CASE WHEN attendance.status = 'absent' THEN 1 ELSE 0 END) AS absent,
            SUM(CASE WHEN attendance.status = 'late' THEN 1 ELSE 0 END) AS late,
            SUM(CASE WHEN attendance.status = 'excused' THEN 1 ELSE 0 END) AS excused
     FROM attendance
     JOIN classes ON classes.id = attendance.class_id
     JOIN courses ON courses.id = classes.course_id
     JOIN instructors ON instructors.id = courses.instructor_id
     WHERE 1 = 1
     ${instructorFilter}
     GROUP BY attendance.class_id, attendance.class_day_id, attendance.date
     ORDER BY attendance.date DESC, startedAt DESC`,
    { userId: user.id }
  );

  const days = await ClassDay.find({
    classId: { $in: classRecords.map((item) => item.classId) }
  })
    .select("classId dayNumber title")
    .lean();
  const dayById = new Map(days.map((day) => [String(day._id), day]));
  const sessionsByClass = sessions.reduce<Record<string, unknown[]>>((grouped, session) => {
    const day = dayById.get(String(session.dayId));
    grouped[session.classId] = [
      ...(grouped[session.classId] ?? []),
      {
        dayId: session.dayId,
        dayNumber: day?.dayNumber ?? null,
        dayTitle: day?.title ?? "Unlinked day",
        date: session.date,
        startedAt: session.startedAt,
        totalMarked: Number(session.totalMarked ?? 0),
        present: Number(session.present ?? 0),
        absent: Number(session.absent ?? 0),
        late: Number(session.late ?? 0),
        excused: Number(session.excused ?? 0)
      }
    ];
    return grouped;
  }, {});

  return classRecords.map((classRecord) => {
    const classSessions = sessionsByClass[classRecord.classId] ?? [];
    const latestSession = classSessions[0] as { startedAt?: string; present?: number } | undefined;
    return {
      ...classRecord,
      totalStudents: Number(classRecord.totalStudents ?? 0),
      sessions: classSessions,
      totalSessions: classSessions.length,
      lastStartedAt: latestSession?.startedAt ?? null,
      lastPresent: latestSession?.present ?? 0
    };
  });
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

attendanceRoutes.get(
  "/health",
  authorize("admin", "instructor"),
  asyncHandler(async (req, res) => {
    res.json({ data: await getAttendanceHealth(req.user!) });
  })
);

attendanceRoutes.post(
  "/",
  authorize("instructor"),
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
    await maybeRunAttendanceAutomations(req.body.studentId, req.body.classId);
    await ActivityLog.create({
      userId: req.user!.id,
      action: "attendance_marked",
      entity: "attendance",
      entityId: req.body.classId,
      metadata: { classId: req.body.classId, dayId: req.body.dayId, studentId: req.body.studentId, status: req.body.status }
    });
    res.status(201).json({ id, ...req.body });
  })
);

attendanceRoutes.put(
  "/:id",
  authorize("instructor"),
  validate(z.object({ params: z.object({ id: z.string().uuid() }), body: attendanceUpdateBody })),
  asyncHandler(async (req, res) => {
    await assertAttendanceWindow(req, { id: String(req.params.id) });
    await execute(
      `UPDATE attendance
       SET status = :status, notes = :notes
      WHERE id = :id`,
      { id: req.params.id, status: req.body.status, notes: req.body.notes }
    );
    const [updated] = await rows<{ student_id: string; class_id: string }>("SELECT * FROM attendance WHERE id = :id", { id: req.params.id });
    if (updated) await maybeRunAttendanceAutomations(updated.student_id, updated.class_id);
    await ActivityLog.create({
      userId: req.user!.id,
      action: "attendance_updated",
      entity: "attendance",
      entityId: String(req.params.id),
      metadata: { status: req.body.status }
    });
    res.json(updated);
  })
);

attendanceRoutes.post(
  "/bulk",
  authorize("instructor"),
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
    const notificationChecks = new Set<string>();
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
      notificationChecks.add(record.studentId);
    }
    for (const studentId of notificationChecks) {
      await maybeRunAttendanceAutomations(studentId, req.body.classId);
    }
    await ActivityLog.create({
      userId: req.user!.id,
      action: "attendance_bulk_saved",
      entity: "attendance",
      entityId: req.body.classId,
      metadata: { classId: req.body.classId, dayId: req.body.dayId, records: req.body.records.length }
    });
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
