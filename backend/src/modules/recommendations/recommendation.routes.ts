import { Router } from "express";
import { Lesson } from "../../database/mongo.models.js";
import { rows } from "../../database/mysql.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { HttpError } from "../../utils/http-error.js";

export const recommendationRoutes = Router();

recommendationRoutes.get(
  "/",
  asyncHandler(async (req, res) => {
    if (req.user?.role !== "student") {
      const latestLessons = await Lesson.find({ published: true }).sort({ createdAt: -1 }).limit(8);
      res.json({ reason: "Latest published learning material", data: latestLessons });
      return;
    }

    const [student] = await rows<{ id: string }>("SELECT id FROM students WHERE user_id = :userId", {
      userId: req.user.id
    });
    if (!student) throw new HttpError(404, "Student profile not found");

    const weakCourses = await rows<{ courseId: string; courseTitle: string; averageGrade: number }>(
      `SELECT courses.id AS courseId, courses.title AS courseTitle, AVG(submissions.grade) AS averageGrade
       FROM submissions
       JOIN assignments ON assignments.id = submissions.assignment_id
       JOIN courses ON courses.id = assignments.course_id
       WHERE submissions.student_id = :studentId AND submissions.grade IS NOT NULL
       GROUP BY courses.id, courses.title
       HAVING averageGrade < 70
       ORDER BY averageGrade ASC`,
      { studentId: student.id }
    );

    const courseIds = weakCourses.map((course) => course.courseId);
    const lessons = courseIds.length
      ? await Lesson.find({ courseId: { $in: courseIds }, published: true }).sort({ order: 1 }).limit(12)
      : await Lesson.find({ published: true }).sort({ createdAt: -1 }).limit(8);

    res.json({
      reason: courseIds.length ? "Based on courses where performance is below 70%" : "No weak areas found yet, showing recent lessons",
      weakCourses,
      data: lessons
    });
  })
);

