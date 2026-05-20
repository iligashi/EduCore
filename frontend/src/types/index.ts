export type Role = "admin" | "instructor" | "student";

export interface User {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  status: string;
  createdAt: string;
}

export interface ApiList<T> {
  data: T[];
  meta?: {
    page: number;
    pageSize: number;
    total: number;
  };
}

export interface Student {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  studentCode: string;
  department: string;
  semester: number;
  status: string;
}

export interface Instructor {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  specialization: string;
  status: string;
}

export interface Course {
  id: string;
  title: string;
  description: string;
  instructorId: string;
  instructorName?: string;
  level: string;
  status: string;
}

export interface Assignment {
  id: string;
  courseId: string;
  courseTitle?: string;
  title: string;
  description: string;
  dueDate: string;
  points: number;
}

export interface AttendanceRecord {
  id: string;
  studentName: string;
  courseTitle: string;
  status: "present" | "absent" | "late" | "excused";
  date: string;
  notes?: string;
}

export interface NotificationItem {
  _id: string;
  title: string;
  message: string;
  type: string;
  readAt?: string | null;
  createdAt: string;
}

