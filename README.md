# EduCore LMS & DMS

EduCore is a full-stack Learning Management System and Digital Management System based on the project master plan PDF in this repository.

## Stack

- Frontend: React, TypeScript, Tailwind CSS, React Hook Form, Zod, TanStack Query, Socket.IO Client, Recharts
- Backend: Node.js, Express, TypeScript, JWT auth, Socket.IO, Multer uploads
- Databases: MySQL at `127.0.0.1:3306` and MongoDB at `mongodb://localhost:27017/educore`

## Quick Start

1. Copy `.env.example` to `backend/.env` and adjust secrets if needed.
2. Create the MySQL schema:

   ```bash
   mysql -h 127.0.0.1 -P 3306 -u root < backend/database/schema.sql
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

4. Seed demo data:

   ```bash
   npm run seed
   ```

5. Run the full stack:

   ```bash
   npm run dev
   ```

Default local URLs:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:4000/api`
- Swagger docs: `http://localhost:4000/api/docs`

Demo accounts created by `npm run seed`:

- Admin: `admin@educore.local` / `Password123!`
- Instructor: `instructor@educore.local` / `Password123!`
- Student: `student@educore.local` / `Password123!`

