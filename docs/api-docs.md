# API Docs

Swagger is available at `http://localhost:4000/api/docs` when the backend is running.

## Main Route Groups

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `GET /api/auth/me`
- `GET|POST|PUT|DELETE /api/users`
- `GET|POST|PUT|DELETE /api/students`
- `GET|POST|PUT|DELETE /api/instructors`
- `GET|POST|PUT|DELETE /api/courses`
- `GET|POST /api/courses/:id/classes`
- `POST /api/courses/classes/:id/enrollments`
- `GET|POST|PUT|DELETE /api/assignments`
- `GET|POST /api/assignments/submissions`
- `PUT /api/assignments/submissions/:id/grade`
- `GET|POST /api/attendance`
- `GET|POST /api/notifications`
- `GET /api/reports/dashboard`
- `GET /api/reports/attendance`
- `GET /api/reports/performance`
- `GET /api/search?q=term`
- `GET|POST|PUT /api/cms/lessons`
- `GET|POST /api/cms/announcements`
- `GET /api/recommendations`
- `GET /api/exports/:entity?format=csv|json|xlsx`
- `POST /api/imports/students`

All routes except auth require `Authorization: Bearer <accessToken>`.

