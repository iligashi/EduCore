import { Router } from "express";
import { z } from "zod";
import { v4 as uuid } from "uuid";
import { Notification } from "../../database/mongo.models.js";
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
  courseId: z.string().uuid(),
  title: z.string().min(2).max(180),
  description: z.string().max(5000).optional().default(""),
  dueDate: z.string().datetime(),
  points: z.coerce.number().int().min(1).max(1000).default(100)
});

async function currentStudentId(userId: string) {
  const [student] = await rows<{ id: string }>("SELECT id FROM students WHERE user_id = :userId", { userId });
  if (!student) throw new HttpError(403, "Student profile not found");
  return student.id;
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
             WHERE classes.course_id = assignments.course_id AND students.user_id = :userId
           )`
        : "";
    const instructorFilter = req.user?.role === "instructor" ? "AND instructors.user_id = :userId" : "";

    const data = await rows(
      `SELECT assignments.id, assignments.course_id AS courseId, assignments.title, assignments.description,
              assignments.due_date AS dueDate, assignments.points, courses.title AS courseTitle,
              users.full_name AS instructorName
       FROM assignments
       JOIN courses ON courses.id = assignments.course_id
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

assignmentRoutes.post(
  "/",
  authorize("admin", "instructor"),
  validate(z.object({ body: assignmentBody })),
  asyncHandler(async (req, res) => {
    const id = uuid();
    await execute(
      `INSERT INTO assignments (id, course_id, title, description, due_date, points)
       VALUES (:id, :courseId, :title, :description, :dueDate, :points)`,
      {
        id,
        courseId: req.body.courseId,
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
      type: "assignment"
    });
    getIo()?.to("role:student").emit("notification:new", notification);

    const [assignment] = await rows("SELECT * FROM assignments WHERE id = :id", { id });
    res.status(201).json(assignment);
  })
);

assignmentRoutes.put(
  "/:id",
  authorize("admin", "instructor"),
  validate(idParamsSchema.extend({ body: assignmentBody.partial() })),
  asyncHandler(async (req, res) => {
    await execute(
      `UPDATE assignments
       SET course_id = COALESCE(:courseId, course_id),
           title = COALESCE(:title, title),
           description = COALESCE(:description, description),
           due_date = COALESCE(:dueDate, due_date),
           points = COALESCE(:points, points)
       WHERE id = :id`,
      {
        id: req.params.id,
        courseId: req.body.courseId,
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
              assignments.title AS assignmentTitle, users.full_name AS studentName, courses.title AS courseTitle
       FROM submissions
       JOIN assignments ON assignments.id = submissions.assignment_id
       JOIN courses ON courses.id = assignments.course_id
       JOIN instructors ON instructors.id = courses.instructor_id
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
    res.status(201).json({ id, assignmentId: parsed.assignmentId, studentId, fileUrl, notes: parsed.notes ?? "" });
  })
);

assignmentRoutes.put(
  "/submissions/:id/grade",
  authorize("admin", "instructor"),
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
    await execute(
      `UPDATE submissions
       SET grade = :grade, feedback = :feedback, graded_at = CURRENT_TIMESTAMP
       WHERE id = :id`,
      { id: req.params.id, grade: req.body.grade, feedback: req.body.feedback }
    );

    const [submission] = await rows<{ studentUserId: string; assignmentTitle: string }>(
      `SELECT students.user_id AS studentUserId, assignments.title AS assignmentTitle
       FROM submissions
       JOIN students ON students.id = submissions.student_id
       JOIN assignments ON assignments.id = submissions.assignment_id
       WHERE submissions.id = :id`,
      { id: req.params.id }
    );
    if (submission) {
      const notification = await Notification.create({
        userId: submission.studentUserId,
        title: "Grade updated",
        message: `${submission.assignmentTitle} has been graded.`,
        type: "grade"
      });
      getIo()?.to(`user:${submission.studentUserId}`).emit("notification:new", notification);
    }

    const [updated] = await rows("SELECT * FROM submissions WHERE id = :id", { id: req.params.id });
    res.json(updated);
  })
);

