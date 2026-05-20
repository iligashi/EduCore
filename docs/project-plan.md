# EduCore Project Plan

This project follows the included `Educore Lms Dms Project Master Plan.pdf` as the source of truth.

## Scope

EduCore is a full-stack Learning Management System and Digital Management System for educational operations.

Core features:

- Role-based authentication for admins, instructors, and students
- Student, instructor, course, class, enrollment, attendance, assignment, and submission management
- MongoDB-backed lessons, notifications, activity logs, announcements, CMS pages, and quiz questions
- Realtime notifications through Socket.IO
- Reports for attendance, performance, class analytics, and dashboard totals
- Advanced search across relational and document data
- CSV, JSON, and Excel export plus student import
- Docker support for frontend, backend, MySQL, and MongoDB

## Development Phases

1. Planning and documentation
2. Backend setup with Express, TypeScript, MySQL, MongoDB, and environment validation
3. Authentication with JWT access tokens, refresh-token rotation, password hashing, RBAC, and protected frontend routes
4. DMS modules for students, instructors, classes, schedules, attendance, and analytics
5. LMS modules for courses, lessons, assignments, submissions, grading, and progress tracking
6. Advanced features for notifications, search, reports, import/export, CMS, and AI-style recommendations
7. Finalization with responsive UI, testing, Swagger, seed data, and presentation material

## Local Services

- MySQL: `127.0.0.1:3306`, user `root`, database `educore`
- MongoDB: `mongodb://localhost:27017/educore`
- Backend: `http://localhost:4000`
- Frontend: `http://localhost:5173`

