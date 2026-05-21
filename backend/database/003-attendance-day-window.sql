USE educore;

ALTER TABLE attendance DROP INDEX IF EXISTS uq_attendance_student_class_date;

