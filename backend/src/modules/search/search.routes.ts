import { Router } from "express";
import { Announcement, CmsContent, Lesson } from "../../database/mongo.models.js";
import { rows } from "../../database/mysql.js";
import { asyncHandler } from "../../utils/async-handler.js";

export const searchRoutes = Router();

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function visibleCourseIds(user: Express.UserClaims) {
  if (user.role === "admin") return undefined;

  if (user.role === "instructor") {
    const courses = await rows<{ id: string }>(
      `SELECT courses.id
       FROM courses
       JOIN instructors ON instructors.id = courses.instructor_id
       WHERE instructors.user_id = :userId`,
      { userId: user.id }
    );
    return courses.map((course) => course.id);
  }

  const courses = await rows<{ id: string }>(
    `SELECT DISTINCT courses.id
     FROM courses
     JOIN classes ON classes.course_id = courses.id
     JOIN enrollments ON enrollments.class_id = classes.id
     JOIN students ON students.id = enrollments.student_id
     WHERE students.user_id = :userId`,
    { userId: user.id }
  );
  return courses.map((course) => course.id);
}

searchRoutes.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? "").trim();
    if (!q) {
      res.json({ students: [], instructors: [], courses: [], lessons: [], assignments: [], announcements: [], pages: [] });
      return;
    }

    const like = `%${q}%`;
    const regex = new RegExp(escapeRegex(q), "i");
    const courseIds = await visibleCourseIds(req.user!);
    const instructorCourseFilter = req.user?.role === "instructor" ? "AND instructors.user_id = :userId" : "";
    const studentCourseFilter =
      req.user?.role === "student"
        ? `AND EXISTS (
             SELECT 1 FROM classes
             JOIN enrollments ON enrollments.class_id = classes.id
             JOIN students ON students.id = enrollments.student_id
             WHERE classes.course_id = courses.id AND students.user_id = :userId
           )`
        : "";

    const studentDirectoryQuery =
      req.user?.role === "admin"
        ? rows(
            `SELECT students.id, users.full_name AS fullName, users.email, students.student_code AS studentCode, students.department
             FROM students JOIN users ON users.id = students.user_id
             WHERE users.full_name LIKE :like OR users.email LIKE :like OR students.student_code LIKE :like OR students.department LIKE :like
             LIMIT 10`,
            { like }
          )
        : req.user?.role === "instructor"
          ? rows(
              `SELECT DISTINCT students.id, users.full_name AS fullName, users.email, students.student_code AS studentCode, students.department
               FROM students
               JOIN users ON users.id = students.user_id
               JOIN enrollments ON enrollments.student_id = students.id
               JOIN classes ON classes.id = enrollments.class_id
               JOIN courses ON courses.id = classes.course_id
               JOIN instructors ON instructors.id = courses.instructor_id
               WHERE instructors.user_id = :userId
                 AND (users.full_name LIKE :like OR users.email LIKE :like OR students.student_code LIKE :like OR students.department LIKE :like)
               LIMIT 10`,
              { like, userId: req.user.id }
            )
          : Promise.resolve([]);

    const instructorDirectoryQuery =
      req.user?.role === "admin"
        ? rows(
            `SELECT instructors.id, users.full_name AS fullName, users.email, instructors.specialization
             FROM instructors JOIN users ON users.id = instructors.user_id
             WHERE users.full_name LIKE :like OR users.email LIKE :like OR instructors.specialization LIKE :like
             LIMIT 10`,
            { like }
          )
        : Promise.resolve([]);

    const [students, instructors, courses, assignments, lessons, announcements, pages] = await Promise.all([
      studentDirectoryQuery,
      instructorDirectoryQuery,
      rows(
        `SELECT courses.id, courses.title, courses.description, courses.level, courses.status
         FROM courses
         JOIN instructors ON instructors.id = courses.instructor_id
         WHERE (courses.title LIKE :like OR courses.description LIKE :like OR courses.level LIKE :like)
         ${instructorCourseFilter}
         ${studentCourseFilter}
         LIMIT 10`,
        { like, userId: req.user?.id }
      ),
      rows(
        `SELECT assignments.id, assignments.title, assignments.description, assignments.due_date AS dueDate
         FROM assignments
         JOIN courses ON courses.id = assignments.course_id
         JOIN instructors ON instructors.id = courses.instructor_id
         WHERE (assignments.title LIKE :like OR assignments.description LIKE :like)
         ${instructorCourseFilter}
         ${studentCourseFilter}
         LIMIT 10`,
        { like, userId: req.user?.id }
      ),
      Lesson.find({
        $or: [{ title: regex }, { content: regex }],
        ...(courseIds ? { courseId: { $in: courseIds } } : {}),
        ...(req.user?.role === "student" ? { published: true } : {})
      }).limit(10),
      Announcement.find({
        $or: [{ title: regex }, { body: regex }],
        ...(courseIds
          ? {
              $and: [
                {
                  $or: [{ courseId: { $in: courseIds } }, { courseId: { $exists: false } }, { courseId: null }]
                }
              ]
            }
          : {}),
        ...(req.user?.role !== "admin" ? { audience: { $in: ["all", req.user!.role] } } : {})
      }).limit(10),
      req.user?.role === "admin" ? CmsContent.find({ $or: [{ title: regex }, { slug: regex }] }).limit(10) : Promise.resolve([])
    ]);

    res.json({ students, instructors, courses, assignments, lessons, announcements, pages });
  })
);
