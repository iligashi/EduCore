# EduCore ERD

```mermaid
erDiagram
  USERS ||--o| STUDENTS : "has profile"
  USERS ||--o| INSTRUCTORS : "has profile"
  INSTRUCTORS ||--o{ COURSES : teaches
  COURSES ||--o{ CLASSES : schedules
  STUDENTS ||--o{ ENROLLMENTS : joins
  CLASSES ||--o{ ENROLLMENTS : contains
  STUDENTS ||--o{ ATTENDANCE : records
  CLASSES ||--o{ ATTENDANCE : tracks
  COURSES ||--o{ ASSIGNMENTS : includes
  ASSIGNMENTS ||--o{ SUBMISSIONS : receives
  STUDENTS ||--o{ SUBMISSIONS : uploads
  USERS ||--o{ REFRESH_TOKENS : owns

  USERS {
    char36 id PK
    string full_name
    string email UK
    string password_hash
    enum role
    enum status
    timestamp created_at
  }

  STUDENTS {
    char36 id PK
    char36 user_id FK
    string student_code UK
    string department
    int semester
  }

  INSTRUCTORS {
    char36 id PK
    char36 user_id FK
    string specialization
  }

  COURSES {
    char36 id PK
    string title
    text description
    char36 instructor_id FK
    string level
    enum status
  }

  CLASSES {
    char36 id PK
    char36 course_id FK
    string room
    json schedule
    datetime starts_at
    datetime ends_at
  }

  ENROLLMENTS {
    char36 id PK
    char36 student_id FK
    char36 class_id FK
    enum status
  }

  ATTENDANCE {
    char36 id PK
    char36 student_id FK
    char36 class_id FK
    enum status
    date date
  }

  ASSIGNMENTS {
    char36 id PK
    char36 course_id FK
    string title
    datetime due_date
    int points
  }

  SUBMISSIONS {
    char36 id PK
    char36 assignment_id FK
    char36 student_id FK
    string file_url
    decimal grade
  }
```

MongoDB collections:

- `lessons`: dynamic lesson blocks and assets
- `notifications`: realtime and persisted notifications
- `activitylogs`: user activity history
- `announcements`: system and course announcements
- `cmscontents`: editable CMS pages
- `quizquestions`: flexible quiz structures

