USE educore;

ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS class_id CHAR(36) NULL AFTER course_id,
  ADD COLUMN IF NOT EXISTS class_day_id VARCHAR(40) NULL AFTER class_id;

ALTER TABLE assignments
  ADD INDEX IF NOT EXISTS idx_assignments_class_day (class_id, class_day_id);

ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS class_day_id VARCHAR(40) NULL AFTER class_id;

ALTER TABLE attendance
  ADD UNIQUE KEY IF NOT EXISTS uq_attendance_student_class_day (student_id, class_id, class_day_id);

