import { Router } from "express";
import fs from "node:fs";
import { parse } from "csv-parse/sync";
import xlsx from "xlsx";
import { v4 as uuid } from "uuid";
import bcrypt from "bcryptjs";
import { rows, withTransaction } from "../../database/mysql.js";
import { authorize } from "../../middleware/authorize.middleware.js";
import { upload } from "../../middleware/upload.middleware.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { toCsv } from "../../utils/csv.js";

export const importExportRoutes = Router();

const exportQueries: Record<string, string> = {
  students: `SELECT students.id, users.full_name AS fullName, users.email, students.student_code AS studentCode, students.department, students.semester
             FROM students JOIN users ON users.id = students.user_id ORDER BY users.full_name`,
  instructors: `SELECT instructors.id, users.full_name AS fullName, users.email, instructors.specialization
                FROM instructors JOIN users ON users.id = instructors.user_id ORDER BY users.full_name`,
  courses: `SELECT courses.id, courses.title, courses.level, courses.status, users.full_name AS instructorName
            FROM courses JOIN instructors ON instructors.id = courses.instructor_id JOIN users ON users.id = instructors.user_id ORDER BY courses.title`,
  attendance: `SELECT users.full_name AS studentName, courses.title AS courseTitle, attendance.status, attendance.date
               FROM attendance
               JOIN students ON students.id = attendance.student_id
               JOIN users ON users.id = students.user_id
               JOIN classes ON classes.id = attendance.class_id
               JOIN courses ON courses.id = classes.course_id
               ORDER BY attendance.date DESC`,
  performance: `SELECT users.full_name AS studentName, courses.title AS courseTitle, AVG(submissions.grade) AS averageGrade
                FROM submissions
                JOIN students ON students.id = submissions.student_id
                JOIN users ON users.id = students.user_id
                JOIN assignments ON assignments.id = submissions.assignment_id
                JOIN courses ON courses.id = assignments.course_id
                GROUP BY users.full_name, courses.title`
};

importExportRoutes.get(
  "/exports/:entity",
  authorize("admin", "instructor"),
  asyncHandler(async (req, res) => {
    const entity = String(req.params.entity);
    const query = exportQueries[entity];
    if (!query) {
      res.status(404).json({ message: "Export entity not found" });
      return;
    }

    const data = await rows<Record<string, unknown>>(query);
    const format = String(req.query.format ?? "csv");

    if (format === "json") {
      res.json({ data });
      return;
    }

    if (format === "xlsx") {
      const workbook = xlsx.utils.book_new();
      const worksheet = xlsx.utils.json_to_sheet(data);
      xlsx.utils.book_append_sheet(workbook, worksheet, entity);
      const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${entity}.xlsx"`);
      res.send(buffer);
      return;
    }

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${entity}.csv"`);
    res.send(toCsv(data));
  })
);

importExportRoutes.post(
  "/imports/students",
  authorize("admin"),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      res.status(422).json({ message: "CSV file is required" });
      return;
    }

    const workbook = xlsx.readFile(req.file.path);
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const textRows =
      firstSheet && req.file.originalname.endsWith(".xlsx")
        ? xlsx.utils.sheet_to_json<Record<string, string>>(firstSheet)
        : parse(fs.readFileSync(req.file.path), {
            columns: true,
            skip_empty_lines: true,
            trim: true
          });

    const passwordHash = await bcrypt.hash("Password123!", 12);
    const created: string[] = [];
    await withTransaction(async (connection) => {
      for (const row of textRows) {
        const userId = uuid();
        const studentId = uuid();
        await connection.execute(
          `INSERT INTO users (id, full_name, email, password_hash, role)
           VALUES (:userId, :fullName, :email, :passwordHash, 'student')`,
          {
            userId,
            fullName: row.fullName,
            email: String(row.email).toLowerCase(),
            passwordHash
          }
        );
        await connection.execute(
          `INSERT INTO students (id, user_id, student_code, department, semester)
           VALUES (:studentId, :userId, :studentCode, :department, :semester)`,
          {
            studentId,
            userId,
            studentCode: row.studentCode,
            department: row.department,
            semester: Number(row.semester ?? 1)
          }
        );
        created.push(studentId);
      }
    });

    res.status(201).json({ imported: created.length, ids: created });
  })
);
