import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { BookOpen, CalendarDays, CheckCircle, ClipboardCheck, Clock, FileText, Inbox, PlayCircle } from "lucide-react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { SectionHeader } from "../components/ui/SectionHeader";
import { api } from "../services/api";
import type { ApiList, Assignment, ClassDay, ClassRecord, Course, NotificationItem } from "../types";

interface Submission {
  id: string;
  assignmentId: string;
  assignmentTitle: string;
  courseTitle: string;
  fileUrl: string;
  grade?: number | null;
  feedback?: string;
  submittedAt: string;
}

function dateLabel(value?: string) {
  if (!value) return "No date";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function dueTone(dueDate: string, submitted: boolean) {
  if (submitted) return "success";
  return new Date(dueDate).getTime() < Date.now() ? "danger" : "warning";
}

export function StudentHomePage() {
  const { data: courses } = useQuery({ queryKey: ["courses"], queryFn: () => api.get<ApiList<Course>>("/courses") });
  const { data: classes } = useQuery({ queryKey: ["classes"], queryFn: () => api.get<{ data: ClassRecord[] }>("/courses/classes/all") });
  const { data: assignments } = useQuery({ queryKey: ["assignments"], queryFn: () => api.get<ApiList<Assignment>>("/assignments") });
  const { data: submissions } = useQuery({ queryKey: ["submissions"], queryFn: () => api.get<{ data: Submission[] }>("/assignments/submissions") });
  const { data: notifications } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get<{ data: NotificationItem[] }>("/notifications")
  });
  const firstClassId = classes?.data?.[0]?.id ?? "";
  const { data: days } = useQuery({
    queryKey: ["class-days", firstClassId],
    queryFn: () => api.get<{ data: ClassDay[] }>(`/courses/classes/${firstClassId}/days`),
    enabled: Boolean(firstClassId)
  });

  const submittedIds = useMemo(() => new Set((submissions?.data ?? []).map((submission) => submission.assignmentId)), [submissions?.data]);
  const openAssignments = useMemo(
    () =>
      (assignments?.data ?? [])
        .filter((assignment) => !submittedIds.has(assignment.id))
        .sort((left, right) => new Date(left.dueDate).getTime() - new Date(right.dueDate).getTime()),
    [assignments?.data, submittedIds]
  );
  const gradedSubmissions = (submissions?.data ?? []).filter((submission) => submission.grade !== null && submission.grade !== undefined);
  const unreadNotifications = (notifications?.data ?? []).filter((item) => !item.readAt);
  const nextLesson = days?.data?.[0];

  return (
    <>
      <SectionHeader
        title="Home"
        description="A simple view of what is next."
        action={
          <Link to="/portal/content">
            <Button>
              <PlayCircle size={16} />
              Continue
            </Button>
          </Link>
        }
      />

      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-teal-50 text-primary">
              <BookOpen size={20} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">Courses</p>
              <p className="text-xl font-semibold">{courses?.data.length ?? 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-amber-50 text-amber-700">
              <ClipboardCheck size={20} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">To Submit</p>
              <p className="text-xl font-semibold">{openAssignments.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
              <CheckCircle size={20} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">Grades</p>
              <p className="text-xl font-semibold">{gradedSubmissions.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-sky-50 text-sky-700">
              <Inbox size={20} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">Unread</p>
              <p className="text-xl font-semibold">{unreadNotifications.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle>Next Up</CardTitle>
              <Link to="/portal/assignments" className="text-sm font-medium text-primary">View work</Link>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {openAssignments.slice(0, 4).map((assignment) => (
                  <div key={assignment.id} className="flex flex-col gap-3 rounded-md border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{assignment.title}</p>
                        <Badge tone={dueTone(assignment.dueDate, false)}>{dateLabel(assignment.dueDate)}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">{assignment.courseTitle}</p>
                    </div>
                    <Link to="/portal/assignments">
                      <Button variant="outline" size="sm">
                        Submit
                      </Button>
                    </Link>
                  </div>
                ))}
                {openAssignments.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border p-5 text-sm text-slate-600">
                    You have no open submissions right now.
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle>My Classes</CardTitle>
              <Link to="/portal/content" className="text-sm font-medium text-primary">Open lessons</Link>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2">
                {(classes?.data ?? []).map((item) => (
                  <div key={item.id} className="rounded-md border border-border p-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-primary">
                        <CalendarDays size={18} />
                      </div>
                      <div>
                        <p className="font-medium">{item.courseTitle}</p>
                        <p className="mt-1 text-sm text-slate-600">{item.room}</p>
                        {item.instructorName ? <p className="mt-1 text-xs text-slate-500">{item.instructorName}</p> : null}
                      </div>
                    </div>
                  </div>
                ))}
                {(classes?.data ?? []).length === 0 ? <p className="text-sm text-slate-500">No classes are assigned yet.</p> : null}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Continue Learning</CardTitle>
            </CardHeader>
            <CardContent>
              {nextLesson ? (
                <div className="space-y-4">
                  <div className="rounded-md bg-muted p-4">
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <FileText size={16} />
                      Day {nextLesson.dayNumber}
                    </div>
                    <p className="mt-2 text-lg font-semibold">{nextLesson.title}</p>
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{nextLesson.content}</p>
                  </div>
                  <Link to="/portal/content">
                    <Button className="w-full">
                      <PlayCircle size={16} />
                      Open lesson
                    </Button>
                  </Link>
                </div>
              ) : (
                <p className="text-sm text-slate-500">No published lesson is available yet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Grades</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {gradedSubmissions.slice(0, 4).map((submission) => (
                  <div key={submission.id} className="rounded-md border border-border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium">{submission.assignmentTitle}</p>
                      <Badge tone="success">{submission.grade}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{submission.courseTitle}</p>
                  </div>
                ))}
                {gradedSubmissions.length === 0 ? <p className="text-sm text-slate-500">No grades posted yet.</p> : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Inbox</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {unreadNotifications.slice(0, 3).map((item) => (
                  <div key={item._id} className="rounded-md border border-border p-3">
                    <div className="flex items-center gap-2">
                      <Clock size={15} className="text-primary" />
                      <p className="font-medium">{item.title}</p>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{item.message}</p>
                  </div>
                ))}
                {unreadNotifications.length === 0 ? <p className="text-sm text-slate-500">No unread messages.</p> : null}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
