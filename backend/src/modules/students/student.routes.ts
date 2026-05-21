import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { authorize } from "../../middleware/authorize.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { execute, rows, withTransaction } from "../../database/mysql.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { HttpError } from "../../utils/http-error.js";
import { getPagination } from "../../utils/pagination.js";
import { idParamsSchema } from "../../utils/schemas.js";

export const studentRoutes = Router();

const createStudentSchema = z.object({
  body: z.object({
    fullName: z.string().min(2).max(120),
    email: z.string().email().max(160),
    password: z.string().min(8).max(100),
    studentCode: z.string().min(2).max(40),
    department: z.string().min(2).max(120),
    semester: z.coerce.number().int().min(1).max(12)
  })
});

const updateStudentSchema = idParamsSchema.extend({
  body: z.object({
    fullName: z.string().min(2).max(120).optional(),
    email: z.string().email().max(160).optional(),
    studentCode: z.string().min(2).max(40).optional(),
    department: z.string().min(2).max(120).optional(),
    semester: z.coerce.number().int().min(1).max(12).optional(),
    status: z.enum(["active", "inactive"]).optional(),
    classIds: z.array(z.string().uuid()).optional()
  })
});

const resetStudentPasswordSchema = idParamsSchema.extend({
  body: z.object({
    password: z.string().min(8).max(100)
  })
});

async function getStudentById(id: string) {
  const [student] = await rows(
    `SELECT students.id, students.student_code AS studentCode, students.department, students.semester,
            users.id AS userId, users.full_name AS fullName, users.email, users.status,
            (
              SELECT GROUP_CONCAT(enrollments.class_id ORDER BY courses.title, classes.room SEPARATOR ',')
              FROM enrollments
              JOIN classes ON classes.id = enrollments.class_id
              JOIN courses ON courses.id = classes.course_id
              WHERE enrollments.student_id = students.id AND enrollments.status = 'active'
            ) AS classIds,
            (
              SELECT GROUP_CONCAT(CONCAT(courses.title, ' / ', classes.room) ORDER BY courses.title, classes.room SEPARATOR '; ')
              FROM enrollments
              JOIN classes ON classes.id = enrollments.class_id
              JOIN courses ON courses.id = classes.course_id
              WHERE enrollments.student_id = students.id AND enrollments.status = 'active'
            ) AS classNames
     FROM students
     JOIN users ON users.id = students.user_id
     WHERE students.id = :id`,
    { id }
  );

  if (!student) throw new HttpError(404, "Student not found");
  return student;
}

studentRoutes.get(
  "/",
  authorize("admin", "instructor"),
  asyncHandler(async (req, res) => {
    const { pageSize, offset, page } = getPagination(req.query);
    const search = `%${String(req.query.search ?? "")}%`;
    const status = String(req.query.status ?? "");
    const department = String(req.query.department ?? "");
    const semesterValue = String(req.query.semester ?? "");
    const parsedSemester = Number(semesterValue);
    const semester = semesterValue && Number.isFinite(parsedSemester) ? parsedSemester : null;
    const classId = String(req.query.classId ?? "");
    const instructorFilter =
      req.user?.role === "instructor"
        ? `AND EXISTS (
             SELECT 1
             FROM enrollments
             JOIN classes ON classes.id = enrollments.class_id
             JOIN courses ON courses.id = classes.course_id
             JOIN instructors ON instructors.id = courses.instructor_id
             WHERE enrollments.student_id = students.id AND instructors.user_id = :userId
           )`
        : "";
    const data = await rows(
      `SELECT students.id, students.student_code AS studentCode, students.department, students.semester,
              users.id AS userId, users.full_name AS fullName, users.email, users.status,
              students.created_at AS createdAt,
              (
                SELECT GROUP_CONCAT(enrollments.class_id ORDER BY courses.title, classes.room SEPARATOR ',')
                FROM enrollments
                JOIN classes ON classes.id = enrollments.class_id
                JOIN courses ON courses.id = classes.course_id
                WHERE enrollments.student_id = students.id AND enrollments.status = 'active'
              ) AS classIds,
              (
                SELECT GROUP_CONCAT(CONCAT(courses.title, ' / ', classes.room) ORDER BY courses.title, classes.room SEPARATOR '; ')
                FROM enrollments
                JOIN classes ON classes.id = enrollments.class_id
                JOIN courses ON courses.id = classes.course_id
                WHERE enrollments.student_id = students.id AND enrollments.status = 'active'
              ) AS classNames
       FROM students
       JOIN users ON users.id = students.user_id
       WHERE (users.full_name LIKE :search OR users.email LIKE :search OR students.student_code LIKE :search OR students.department LIKE :search)
       AND (:status = '' OR users.status = :status)
       AND (:department = '' OR students.department = :department)
       AND (:semester IS NULL OR students.semester = :semester)
       AND (:classId = '' OR EXISTS (
         SELECT 1
         FROM enrollments
         WHERE enrollments.student_id = students.id
           AND enrollments.class_id = :classId
           AND enrollments.status = 'active'
       ))
       ${instructorFilter}
       ORDER BY users.full_name
       LIMIT :pageSize OFFSET :offset`,
      { search, status, department, semester, classId, pageSize, offset, userId: req.user?.id }
    );
    const [count] = await rows<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM students
       JOIN users ON users.id = students.user_id
       WHERE (users.full_name LIKE :search OR users.email LIKE :search OR students.student_code LIKE :search OR students.department LIKE :search)
       AND (:status = '' OR users.status = :status)
       AND (:department = '' OR students.department = :department)
       AND (:semester IS NULL OR students.semester = :semester)
       AND (:classId = '' OR EXISTS (
         SELECT 1
         FROM enrollments
         WHERE enrollments.student_id = students.id
           AND enrollments.class_id = :classId
           AND enrollments.status = 'active'
       ))
       ${instructorFilter}`,
      { search, status, department, semester, classId, userId: req.user?.id }
    );
    res.json({ data, meta: { page, pageSize, total: count.total } });
  })
);

studentRoutes.post(
  "/",
  authorize("admin"),
  validate(createStudentSchema),
  asyncHandler(async (req, res) => {
    const userId = uuid();
    const studentId = uuid();
    const passwordHash = await bcrypt.hash(req.body.password, 12);
    await withTransaction(async (connection) => {
      await connection.execute(
        `INSERT INTO users (id, full_name, email, password_hash, role)
         VALUES (:userId, :fullName, :email, :passwordHash, 'student')`,
        {
          userId,
          fullName: req.body.fullName,
          email: req.body.email.toLowerCase(),
          passwordHash
        }
      );
      await connection.execute(
        `INSERT INTO students (id, user_id, student_code, department, semester)
         VALUES (:studentId, :userId, :studentCode, :department, :semester)`,
        {
          studentId,
          userId,
          studentCode: req.body.studentCode,
          department: req.body.department,
          semester: req.body.semester
        }
      );
    });
    const student = await getStudentById(studentId);
    res.status(201).json(student);
  })
);

studentRoutes.get(
  "/:id/history",
  authorize("admin", "instructor"),
  validate(idParamsSchema),
  asyncHandler(async (req, res) => {
    if (req.user!.role === "instructor") {
      const [allowed] = await rows<{ id: string }>(
        `SELECT students.id
         FROM students
         JOIN enrollments ON enrollments.student_id = students.id
         JOIN classes ON classes.id = enrollments.class_id
         JOIN courses ON courses.id = classes.course_id
         JOIN instructors ON instructors.id = courses.instructor_id
         WHERE students.id = :studentId AND instructors.user_id = :userId`,
        { studentId: req.params.id, userId: req.user!.id }
      );
      if (!allowed) {
        res.status(403).json({ message: "You can only view history for students in your classes" });
        return;
      }
    }

    const [student] = await rows(
      `SELECT students.id, students.student_code AS studentCode, students.department, students.semester,
              users.full_name AS fullName, users.email
       FROM students
       JOIN users ON users.id = students.user_id
       WHERE students.id = :studentId`,
      { studentId: req.params.id }
    );
    const courses = await rows(
      `SELECT DISTINCT courses.id, courses.title, classes.id AS classId, classes.room, enrollments.status
       FROM enrollments
       JOIN classes ON classes.id = enrollments.class_id
       JOIN courses ON courses.id = classes.course_id
       WHERE enrollments.student_id = :studentId
       ORDER BY courses.title`,
      { studentId: req.params.id }
    );
    const submissions = await rows(
      `SELECT submissions.id, assignments.title AS assignmentTitle, courses.title AS courseTitle,
              classes.room AS classRoom, submissions.file_url AS fileUrl,
              submissions.grade, submissions.feedback, submissions.submitted_at AS submittedAt,
              submissions.graded_at AS gradedAt
       FROM submissions
       JOIN assignments ON assignments.id = submissions.assignment_id
       JOIN courses ON courses.id = assignments.course_id
       LEFT JOIN classes ON classes.id = assignments.class_id
       WHERE submissions.student_id = :studentId
       ORDER BY submissions.submitted_at DESC`,
      { studentId: req.params.id }
    );
    const attendance = await rows(
      `SELECT attendance.id, courses.title AS courseTitle, classes.room,
              attendance.class_day_id AS dayId, attendance.status, attendance.date, attendance.notes
       FROM attendance
       JOIN classes ON classes.id = attendance.class_id
       JOIN courses ON courses.id = classes.course_id
       WHERE attendance.student_id = :studentId
       ORDER BY attendance.date DESC`,
      { studentId: req.params.id }
    );

    res.json({ student, courses, submissions, attendance });
  })
);

studentRoutes.put(
  "/:id",
  authorize("admin"),
  validate(updateStudentSchema),
  asyncHandler(async (req, res) => {
    await withTransaction(async (connection) => {
      await connection.execute(
        `UPDATE students
         SET student_code = COALESCE(:studentCode, student_code),
             department = COALESCE(:department, department),
             semester = COALESCE(:semester, semester)
         WHERE id = :id`,
        {
          id: req.params.id,
          studentCode: req.body.studentCode,
          department: req.body.department,
          semester: req.body.semester
        }
      );
      await connection.execute(
        `UPDATE users
         JOIN students ON students.user_id = users.id
         SET users.full_name = COALESCE(:fullName, users.full_name),
             users.email = COALESCE(:email, users.email),
             users.status = COALESCE(:status, users.status)
         WHERE students.id = :id`,
        {
          id: req.params.id,
          fullName: req.body.fullName,
          email: req.body.email?.toLowerCase(),
          status: req.body.status
        }
      );
      if (Array.isArray(req.body.classIds)) {
        await connection.execute("UPDATE enrollments SET status = 'dropped' WHERE student_id = :id AND status = 'active'", {
          id: req.params.id
        });
        for (const classId of req.body.classIds) {
          await connection.execute(
            `INSERT INTO enrollments (id, student_id, class_id, status)
             VALUES (:id, :studentId, :classId, 'active')
             ON DUPLICATE KEY UPDATE status = 'active'`,
            { id: uuid(), studentId: req.params.id, classId }
          );
        }
      }
    });
    const student = await getStudentById(String(req.params.id));
    res.json(student);
  })
);

studentRoutes.post(
  "/:id/reset-password",
  authorize("admin"),
  validate(resetStudentPasswordSchema),
  asyncHandler(async (req, res) => {
    const passwordHash = await bcrypt.hash(req.body.password, 12);
    const result = await execute(
      `UPDATE users
       JOIN students ON students.user_id = users.id
       SET users.password_hash = :passwordHash
       WHERE students.id = :id`,
      { id: req.params.id, passwordHash }
    );
    if (!result.affectedRows) throw new HttpError(404, "Student not found");
    await execute(
      `UPDATE refresh_tokens
       JOIN users ON users.id = refresh_tokens.user_id
       JOIN students ON students.user_id = users.id
       SET refresh_tokens.revoked_at = NOW()
       WHERE students.id = :id AND refresh_tokens.revoked_at IS NULL`,
      { id: req.params.id }
    );
    res.json({ message: "Student password reset" });
  })
);

studentRoutes.delete(
  "/:id",
  authorize("admin"),
  validate(idParamsSchema),
  asyncHandler(async (req, res) => {
    await withTransaction(async (connection) => {
      await connection.execute(
        `DELETE users FROM users
         JOIN students ON students.user_id = users.id
         WHERE students.id = :id`,
        { id: req.params.id }
      );
    });
    res.status(204).send();
  })
);
