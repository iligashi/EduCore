import bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";
import { connectMongo, disconnectMongo } from "./mongo.js";
import { ActivityLog, Announcement, ClassBackup, ClassDay, CmsContent, Lesson, Notification, QuizQuestion } from "./mongo.models.js";
import { execute, pool } from "./mysql.js";

const password = "Password123!";

async function upsertUser(input: {
  id: string;
  fullName: string;
  email: string;
  role: "admin" | "instructor" | "student";
  passwordHash: string;
}) {
  await execute(
    `INSERT INTO users (id, full_name, email, password_hash, role)
     VALUES (:id, :fullName, :email, :passwordHash, :role)
     ON DUPLICATE KEY UPDATE full_name = VALUES(full_name), password_hash = VALUES(password_hash), role = VALUES(role), status = 'active'`,
    input
  );
}

async function seedSql() {
  const passwordHash = await bcrypt.hash(password, 12);
  const adminId = "11111111-1111-4111-8111-111111111111";
  const instructorUserId = "22222222-2222-4222-8222-222222222222";
  const studentUserId = "33333333-3333-4333-8333-333333333333";
  const instructorId = "44444444-4444-4444-8444-444444444444";
  const studentId = "55555555-5555-4555-8555-555555555555";
  const courseId = "66666666-6666-4666-8666-666666666666";
  const classId = "77777777-7777-4777-8777-777777777777";
  const assignmentId = "88888888-8888-4888-8888-888888888888";

  await upsertUser({
    id: adminId,
    fullName: "EduCore Admin",
    email: "admin@educore.local",
    role: "admin",
    passwordHash
  });
  await upsertUser({
    id: instructorUserId,
    fullName: "Mira Instructor",
    email: "instructor@educore.local",
    role: "instructor",
    passwordHash
  });
  await upsertUser({
    id: studentUserId,
    fullName: "Sam Student",
    email: "student@educore.local",
    role: "student",
    passwordHash
  });

  await execute(
    `INSERT INTO instructors (id, user_id, specialization)
     VALUES (:id, :userId, :specialization)
     ON DUPLICATE KEY UPDATE specialization = VALUES(specialization)`,
    { id: instructorId, userId: instructorUserId, specialization: "Full-stack Web Development" }
  );

  await execute(
    `INSERT INTO students (id, user_id, student_code, department, semester)
     VALUES (:id, :userId, :studentCode, :department, :semester)
     ON DUPLICATE KEY UPDATE department = VALUES(department), semester = VALUES(semester)`,
    { id: studentId, userId: studentUserId, studentCode: "STU-1001", department: "Computer Science", semester: 4 }
  );

  await execute(
    `INSERT INTO courses (id, title, description, instructor_id, level, status)
     VALUES (:id, :title, :description, :instructorId, :level, 'published')
     ON DUPLICATE KEY UPDATE title = VALUES(title), description = VALUES(description), level = VALUES(level), status = 'published'`,
    {
      id: courseId,
      title: "Modern Web Systems",
      description: "Build and ship full-stack educational platforms with React, Node, MySQL, and MongoDB.",
      instructorId,
      level: "Intermediate"
    }
  );

  await execute(
    `INSERT INTO classes (id, course_id, room, schedule, starts_at, ends_at)
     VALUES (:id, :courseId, :room, :schedule, :startsAt, :endsAt)
     ON DUPLICATE KEY UPDATE room = VALUES(room), schedule = VALUES(schedule), starts_at = VALUES(starts_at), ends_at = VALUES(ends_at)`,
    {
      id: classId,
      courseId,
      room: "Lab 204",
      schedule: JSON.stringify({ days: ["Monday", "Wednesday"], time: "10:00-11:30" }),
      startsAt: "2026-06-01 10:00:00",
      endsAt: "2026-08-28 11:30:00"
    }
  );

  await execute(
    `INSERT INTO enrollments (id, student_id, class_id)
     VALUES (:id, :studentId, :classId)
     ON DUPLICATE KEY UPDATE status = 'active'`,
    { id: uuid(), studentId, classId }
  );

  await execute(
    `INSERT INTO assignments (id, course_id, title, description, due_date, points)
     VALUES (:id, :courseId, :title, :description, :dueDate, :points)
     ON DUPLICATE KEY UPDATE title = VALUES(title), description = VALUES(description), due_date = VALUES(due_date), points = VALUES(points)`,
    {
      id: assignmentId,
      courseId,
      title: "LMS Architecture Brief",
      description: "Design a modular backend and frontend plan for a school LMS.",
      dueDate: "2026-06-20 23:59:00",
      points: 100
    }
  );

  await execute(
    `INSERT INTO attendance (id, student_id, class_id, status, date, notes)
     VALUES (:id, :studentId, :classId, 'present', CURRENT_DATE(), 'Seed attendance')
     ON DUPLICATE KEY UPDATE status = 'present', notes = 'Seed attendance'`,
    { id: uuid(), studentId, classId }
  );
}

async function seedMongo() {
  const courseId = "66666666-6666-4666-8666-666666666666";
  await Promise.all([
    Lesson.deleteMany({ courseId }),
    ClassDay.deleteMany({ classId: "77777777-7777-4777-8777-777777777777" }),
    ClassBackup.deleteMany({ classId: "77777777-7777-4777-8777-777777777777" }),
    Announcement.deleteMany({ courseId }),
    Notification.deleteMany({ title: /EduCore/i }),
    ActivityLog.deleteMany({ action: "seed" }),
    CmsContent.deleteMany({ slug: { $in: ["home", "student-handbook"] } }),
    QuizQuestion.deleteMany({})
  ]);

  const lesson = await Lesson.create({
    courseId,
    title: "Welcome to Modern Web Systems",
    content: "This lesson introduces the EduCore architecture and the relationship between LMS and DMS modules.",
    blocks: [
      { type: "heading", text: "Course Overview" },
      { type: "paragraph", text: "React powers the frontend, Express handles APIs, MySQL stores relational data, and MongoDB stores flexible content." }
    ],
    order: 1,
    published: true
  });

  await QuizQuestion.create({
    lessonId: lesson._id,
    prompt: "Which database stores dynamic lesson blocks in EduCore?",
    type: "single",
    options: ["MySQL", "MongoDB", "Redis"],
    correctAnswers: ["MongoDB"]
  });

  await ClassDay.create({
    classId: "77777777-7777-4777-8777-777777777777",
    courseId,
    dayNumber: 1,
    title: "Platform Architecture",
    content: "Day 1 covers the EduCore architecture, user roles, and how LMS content connects to DMS operations.",
    blocks: [
      { type: "heading", text: "Day 1" },
      { type: "paragraph", text: "Review the React frontend, Express API, MySQL records, and MongoDB content collections." }
    ],
    assets: [],
    published: true
  });

  await Announcement.create({
    courseId,
    title: "EduCore demo course published",
    body: "The starter course, class, assignment, lesson, and report data are ready.",
    audience: "all"
  });

  await Notification.create({
    role: "student",
    title: "EduCore assignment ready",
    message: "Your first LMS Architecture Brief assignment is available.",
    type: "assignment"
  });

  await CmsContent.create([
    {
      slug: "home",
      title: "EduCore Portal",
      status: "published",
      blocks: [
        { type: "hero", text: "Learning operations, courses, reporting, and communication in one place." }
      ]
    },
    {
      slug: "student-handbook",
      title: "Student Handbook",
      status: "draft",
      blocks: [{ type: "paragraph", text: "Policies, support contacts, and academic expectations." }]
    }
  ]);

  await ActivityLog.create({
    action: "seed",
    entity: "system",
    metadata: { message: "Seed data installed" }
  });
}

async function main() {
  await seedSql();
  await connectMongo();
  await seedMongo();
  await disconnectMongo();
  await pool.end();
  console.log("EduCore seed complete. Password for demo accounts:", password);
}

main().catch(async (error) => {
  console.error(error);
  await disconnectMongo().catch(() => undefined);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
