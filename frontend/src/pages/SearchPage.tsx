import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { SectionHeader } from "../components/ui/SectionHeader";
import { api } from "../services/api";

interface SearchResults {
  students: { id: string; fullName: string; email: string }[];
  instructors: { id: string; fullName: string; email: string }[];
  courses: { id: string; title: string; description: string }[];
  assignments: { id: string; title: string; description: string }[];
  lessons: { _id: string; title: string; content: string }[];
  announcements: { _id: string; title: string; body: string }[];
  pages: { _id: string; title: string; slug: string }[];
}

interface StudentHistory {
  student: { id: string; fullName: string; email: string; studentCode: string };
  courses: { id: string; title: string; room: string; status: string }[];
  submissions: { id: string; assignmentTitle: string; courseTitle: string; grade?: number | null; feedback?: string; submittedAt: string }[];
  attendance: { id: string; courseTitle: string; status: string; date: string; notes?: string }[];
}

function ResultGroup<T extends { id?: string; _id?: string } & Record<string, unknown>>({
  title,
  items,
  primaryKey,
  secondaryKey
}: {
  title: string;
  items: T[];
  primaryKey: keyof T;
  secondaryKey?: keyof T;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {items.map((item) => (
            <div key={String(item.id ?? item._id)} className="rounded-md bg-muted p-3">
              <p className="font-medium">{String(item[primaryKey] ?? "")}</p>
              {secondaryKey ? <p className="mt-1 text-sm text-slate-600">{String(item[secondaryKey] ?? "")}</p> : null}
            </div>
          ))}
          {items.length === 0 ? <p className="text-sm text-slate-500">No matches</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function SearchPage() {
  const [q, setQ] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const { data } = useQuery({
    queryKey: ["search", q],
    queryFn: () => api.get<SearchResults>(`/search?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length > 1
  });
  const { data: history } = useQuery({
    queryKey: ["student-history", selectedStudentId],
    queryFn: () => api.get<StudentHistory>(`/students/${selectedStudentId}/history`),
    enabled: Boolean(selectedStudentId)
  });

  return (
    <>
      <SectionHeader title="Search" description="Search students, instructors, courses, lessons, assignments, CMS pages, and announcements." />
      <div className="relative mb-6">
        <Search className="absolute left-3 top-3 text-slate-400" size={18} />
        <Input className="h-12 pl-10" placeholder="Search EduCore" value={q} onChange={(event) => setQ(event.target.value)} />
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Students</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(data?.students ?? []).map((student) => (
                <button
                  key={student.id}
                  className="w-full rounded-md bg-muted p-3 text-left"
                  onClick={() => setSelectedStudentId(student.id)}
                >
                  <p className="font-medium">{student.fullName}</p>
                  <p className="mt-1 text-sm text-slate-600">{student.email}</p>
                </button>
              ))}
              {(data?.students ?? []).length === 0 ? <p className="text-sm text-slate-500">No matches</p> : null}
            </div>
          </CardContent>
        </Card>
        <ResultGroup title="Instructors" items={data?.instructors ?? []} primaryKey="fullName" secondaryKey="email" />
        <ResultGroup title="Courses" items={data?.courses ?? []} primaryKey="title" secondaryKey="description" />
        <ResultGroup title="Assignments" items={data?.assignments ?? []} primaryKey="title" secondaryKey="description" />
        <ResultGroup title="Lessons" items={data?.lessons ?? []} primaryKey="title" secondaryKey="content" />
        <ResultGroup title="Announcements" items={data?.announcements ?? []} primaryKey="title" secondaryKey="body" />
      </div>
      {history ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{history.student.fullName} History</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 xl:grid-cols-3">
            <div>
              <h3 className="mb-2 text-sm font-semibold">Courses</h3>
              <div className="space-y-2">
                {history.courses.map((course) => (
                  <div key={`${course.id}-${course.room}`} className="rounded-md bg-muted p-3 text-sm">
                    <p className="font-medium">{course.title}</p>
                    <p className="text-slate-500">{course.room} / {course.status}</p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold">Assignments</h3>
              <div className="space-y-2">
                {history.submissions.map((submission) => (
                  <div key={submission.id} className="rounded-md bg-muted p-3 text-sm">
                    <p className="font-medium">{submission.assignmentTitle}</p>
                    <p className="text-slate-500">{submission.courseTitle} / Grade: {submission.grade ?? "Pending"}</p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold">Attendance</h3>
              <div className="space-y-2">
                {history.attendance.map((record) => (
                  <div key={record.id} className="rounded-md bg-muted p-3 text-sm">
                    <p className="font-medium">{record.courseTitle}</p>
                    <p className="text-slate-500">{record.date} / {record.status}</p>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
