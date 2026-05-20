import { Router } from "express";
import { Announcement, CmsContent, Lesson } from "../../database/mongo.models.js";
import { rows } from "../../database/mysql.js";
import { asyncHandler } from "../../utils/async-handler.js";

export const searchRoutes = Router();

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
    const [students, instructors, courses, assignments, lessons, announcements, pages] = await Promise.all([
      rows(
        `SELECT students.id, users.full_name AS fullName, users.email, students.student_code AS studentCode, students.department
         FROM students JOIN users ON users.id = students.user_id
         WHERE users.full_name LIKE :like OR users.email LIKE :like OR students.student_code LIKE :like OR students.department LIKE :like
         LIMIT 10`,
        { like }
      ),
      rows(
        `SELECT instructors.id, users.full_name AS fullName, users.email, instructors.specialization
         FROM instructors JOIN users ON users.id = instructors.user_id
         WHERE users.full_name LIKE :like OR users.email LIKE :like OR instructors.specialization LIKE :like
         LIMIT 10`,
        { like }
      ),
      rows(
        `SELECT id, title, description, level, status
         FROM courses
         WHERE title LIKE :like OR description LIKE :like OR level LIKE :like
         LIMIT 10`,
        { like }
      ),
      rows(
        `SELECT id, title, description, due_date AS dueDate
         FROM assignments
         WHERE title LIKE :like OR description LIKE :like
         LIMIT 10`,
        { like }
      ),
      Lesson.find({ $or: [{ title: regex }, { content: regex }] }).limit(10),
      Announcement.find({ $or: [{ title: regex }, { body: regex }] }).limit(10),
      CmsContent.find({ $or: [{ title: regex }, { slug: regex }] }).limit(10)
    ]);

    res.json({ students, instructors, courses, assignments, lessons, announcements, pages });
  })
);

