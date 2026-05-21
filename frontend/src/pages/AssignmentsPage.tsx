import { useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CalendarDays, CheckCircle, Clock, ExternalLink, FileUp, Plus, Star } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Input, Textarea } from "../components/ui/Input";
import { SectionHeader } from "../components/ui/SectionHeader";
import { Table, Td, Th } from "../components/ui/Table";
import { useAuth } from "../features/auth/AuthProvider";
import { api } from "../services/api";
import type { ApiList, Assignment, ClassDay, ClassRecord, Course } from "../types";

interface Submission {
  id: string;
  assignmentId: string;
  assignmentTitle: string;
  studentName: string;
  courseTitle: string;
  classId?: string;
  classRoom?: string;
  dayId?: string;
  fileUrl: string;
  grade?: number | null;
  feedback?: string;
  submittedAt: string;
}

interface ClassHealthDay {
  dayId: string;
  dayNumber: number;
  title: string;
  published: boolean;
  assignments: number;
  submissions: number;
  gradedSubmissions: number;
  ungradedSubmissions: number;
}

interface ClassHealth {
  classId: string;
  courseTitle: string;
  room: string;
  instructorUserId: string;
  instructorName: string;
  totalDays: number;
  assignmentDays: number;
  gradedDays: number;
  ungradedDays: number;
  totalAssignments: number;
  totalSubmissions: number;
  gradedSubmissions: number;
  ungradedSubmissions: number;
  unlinkedAssignments: number;
  days: ClassHealthDay[];
}

const assignmentSchema = z.object({
  courseId: z.string().uuid().optional().or(z.literal("")),
  classId: z.string().uuid().optional().or(z.literal("")),
  dayId: z.string().optional().or(z.literal("")),
  title: z.string().min(2),
  description: z.string().optional(),
  dueDate: z.string().min(1),
  points: z.coerce.number().int().min(1).default(100)
});

export function AssignmentsPage() {
  const { user } = useAuth();
  if (user?.role === "admin") return <AdminAssignmentHealth />;
  if (user?.role === "student") return <StudentAssignmentWorkspace />;
  return <AssignmentWorkflow />;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function StudentAssignmentWorkspace() {
  const queryClient = useQueryClient();
  const [selectedAssignmentId, setSelectedAssignmentId] = useState("");
  const [submissionFile, setSubmissionFile] = useState<File | null>(null);
  const [filter, setFilter] = useState<"open" | "submitted" | "graded">("open");

  const { data: assignments } = useQuery({
    queryKey: ["assignments"],
    queryFn: () => api.get<ApiList<Assignment>>("/assignments")
  });
  const { data: submissions } = useQuery({
    queryKey: ["submissions"],
    queryFn: () => api.get<{ data: Submission[] }>("/assignments/submissions")
  });

  const submissionByAssignmentId = useMemo(
    () => new Map((submissions?.data ?? []).map((submission) => [submission.assignmentId, submission])),
    [submissions?.data]
  );
  const assignmentRows = useMemo(
    () =>
      (assignments?.data ?? []).map((assignment) => {
        const submission = submissionByAssignmentId.get(assignment.id);
        const isGraded = submission?.grade !== null && submission?.grade !== undefined;
        const isSubmitted = Boolean(submission);
        const isOverdue = !isSubmitted && new Date(assignment.dueDate).getTime() < Date.now();
        const status = isGraded ? "graded" : isSubmitted ? "submitted" : "open";
        return { assignment, submission, isGraded, isSubmitted, isOverdue, status };
      }),
    [assignments?.data, submissionByAssignmentId]
  );
  const visibleRows = assignmentRows.filter((row) => row.status === filter);
  const selectedRow =
    assignmentRows.find((row) => row.assignment.id === selectedAssignmentId) ??
    visibleRows[0] ??
    assignmentRows[0];

  const submitAssignment = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      form.append("assignmentId", selectedRow.assignment.id);
      if (submissionFile) form.append("file", submissionFile);
      return api.post("/assignments/submissions", form);
    },
    onSuccess: () => {
      setSubmissionFile(null);
      queryClient.invalidateQueries({ queryKey: ["submissions"] });
    }
  });

  const openCount = assignmentRows.filter((row) => row.status === "open").length;
  const submittedCount = assignmentRows.filter((row) => row.status === "submitted").length;
  const gradedCount = assignmentRows.filter((row) => row.status === "graded").length;

  return (
    <>
      <SectionHeader title="Work" description="Assignments, uploads, and grades." />

      <div className="grid gap-3 md:grid-cols-3">
        <button
          type="button"
          className={`rounded-lg border p-4 text-left shadow-soft ${filter === "open" ? "border-primary bg-white" : "border-border bg-white"}`}
          onClick={() => setFilter("open")}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase text-slate-500">To Submit</p>
            <Clock size={18} className="text-amber-700" />
          </div>
          <p className="mt-2 text-2xl font-semibold">{openCount}</p>
        </button>
        <button
          type="button"
          className={`rounded-lg border p-4 text-left shadow-soft ${filter === "submitted" ? "border-primary bg-white" : "border-border bg-white"}`}
          onClick={() => setFilter("submitted")}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase text-slate-500">Waiting Grade</p>
            <FileUp size={18} className="text-primary" />
          </div>
          <p className="mt-2 text-2xl font-semibold">{submittedCount}</p>
        </button>
        <button
          type="button"
          className={`rounded-lg border p-4 text-left shadow-soft ${filter === "graded" ? "border-primary bg-white" : "border-border bg-white"}`}
          onClick={() => setFilter("graded")}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase text-slate-500">Graded</p>
            <CheckCircle size={18} className="text-emerald-700" />
          </div>
          <p className="mt-2 text-2xl font-semibold">{gradedCount}</p>
        </button>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader>
            <CardTitle>{filter === "open" ? "To Submit" : filter === "submitted" ? "Waiting For Grade" : "Graded Work"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              {visibleRows.map((row) => (
                <button
                  key={row.assignment.id}
                  type="button"
                  className={`rounded-md border p-4 text-left transition hover:border-primary ${
                    selectedRow?.assignment.id === row.assignment.id ? "border-primary bg-teal-50" : "border-border bg-white"
                  }`}
                  onClick={() => setSelectedAssignmentId(row.assignment.id)}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{row.assignment.title}</p>
                        {row.isGraded ? <Badge tone="success">graded</Badge> : row.isSubmitted ? <Badge tone="info">submitted</Badge> : null}
                        {row.isOverdue ? <Badge tone="danger">overdue</Badge> : null}
                      </div>
                      <p className="mt-1 text-sm text-slate-600">{row.assignment.courseTitle}</p>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <CalendarDays size={15} />
                      {formatDateTime(row.assignment.dueDate)}
                    </div>
                  </div>
                </button>
              ))}
              {visibleRows.length === 0 ? <p className="rounded-md border border-dashed border-border p-5 text-sm text-slate-500">Nothing here right now.</p> : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedRow ? (
              <div className="space-y-4">
                <div>
                  <p className="text-lg font-semibold">{selectedRow.assignment.title}</p>
                  <p className="mt-1 text-sm text-slate-600">{selectedRow.assignment.courseTitle}</p>
                </div>

                <div className="grid gap-3">
                  <div className="rounded-md bg-muted p-3">
                    <p className="text-xs font-semibold uppercase text-slate-500">Due</p>
                    <p className="mt-1 text-sm font-medium">{formatDateTime(selectedRow.assignment.dueDate)}</p>
                  </div>
                  <div className="rounded-md bg-muted p-3">
                    <p className="text-xs font-semibold uppercase text-slate-500">Points</p>
                    <p className="mt-1 text-sm font-medium">{selectedRow.assignment.points}</p>
                  </div>
                </div>

                {selectedRow.assignment.description ? <p className="text-sm leading-6 text-slate-700">{selectedRow.assignment.description}</p> : null}

                {selectedRow.submission ? (
                  <div className="rounded-md border border-border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium">Submission</p>
                      {selectedRow.isGraded ? <Badge tone="success">{selectedRow.submission.grade}</Badge> : <Badge tone="info">waiting</Badge>}
                    </div>
                    <a className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-primary" href={selectedRow.submission.fileUrl} target="_blank" rel="noreferrer">
                      <ExternalLink size={15} />
                      Open uploaded file
                    </a>
                    {selectedRow.submission.feedback ? <p className="mt-3 text-sm leading-6 text-slate-600">{selectedRow.submission.feedback}</p> : null}
                  </div>
                ) : null}

                {!selectedRow.isGraded ? (
                  <div className="space-y-3 border-t border-border pt-4">
                    <Input type="file" onChange={(event) => setSubmissionFile(event.target.files?.[0] ?? null)} />
                    <Button
                      className="w-full"
                      disabled={!submissionFile || submitAssignment.isPending}
                      onClick={() => submitAssignment.mutate()}
                    >
                      <FileUp size={16} />
                      {selectedRow.isSubmitted ? "Replace submission" : "Upload submission"}
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No assignment selected.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function AdminAssignmentHealth() {
  const [selectedClassId, setSelectedClassId] = useState("");
  const [notifiedClassId, setNotifiedClassId] = useState("");
  const { data } = useQuery({
    queryKey: ["assignment-class-health"],
    queryFn: () => api.get<{ data: ClassHealth[] }>("/assignments/class-health")
  });
  const selectedClass = useMemo(
    () => (data?.data ?? []).find((item) => item.classId === selectedClassId),
    [data?.data, selectedClassId]
  );
  const notifyInstructor = useMutation({
    mutationFn: (classId: string) => api.post(`/assignments/class-health/${classId}/notify-ungraded`),
    onSuccess: (_result, classId) => setNotifiedClassId(classId)
  });

  return (
    <>
      <SectionHeader title="Assignments" description="Class health, assignment coverage, and grading follow-up." />
      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Class Health</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <thead>
                <tr>
                  <Th>Class</Th>
                  <Th>Days</Th>
                  <Th>Assignment Days</Th>
                  <Th>Ungraded</Th>
                </tr>
              </thead>
              <tbody>
                {(data?.data ?? []).map((item) => (
                  <tr
                    key={item.classId}
                    className={selectedClassId === item.classId ? "bg-teal-50" : "cursor-pointer"}
                    onClick={() => setSelectedClassId(item.classId)}
                  >
                    <Td>
                      <button type="button" className="text-left" onClick={() => setSelectedClassId(item.classId)}>
                        <span className="block font-medium">{item.courseTitle} / {item.room}</span>
                        <span className="text-xs text-slate-500">{item.instructorName}</span>
                      </button>
                    </Td>
                    <Td>{item.totalDays}</Td>
                    <Td>{item.assignmentDays}</Td>
                    <Td>
                      {item.ungradedSubmissions > 0 ? (
                        <Badge tone="warning">{item.ungradedSubmissions}</Badge>
                      ) : (
                        <Badge tone="success">0</Badge>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle>{selectedClass ? `${selectedClass.courseTitle} / ${selectedClass.room}` : "Class Detail"}</CardTitle>
                {selectedClass && selectedClass.ungradedSubmissions > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={notifyInstructor.isPending}
                    onClick={() => notifyInstructor.mutate(selectedClass.classId)}
                  >
                    {notifiedClassId === selectedClass.classId ? <CheckCircle size={16} /> : <Bell size={16} />}
                    {notifiedClassId === selectedClass.classId ? "Reminder sent" : "Notify instructor"}
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent>
              {selectedClass ? (
                <div className="space-y-5">
                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="rounded-md bg-muted p-3">
                      <p className="text-xs font-semibold uppercase text-slate-500">Days</p>
                      <p className="mt-1 text-2xl font-semibold">{selectedClass.totalDays}</p>
                    </div>
                    <div className="rounded-md bg-muted p-3">
                      <p className="text-xs font-semibold uppercase text-slate-500">Days With Assignments</p>
                      <p className="mt-1 text-2xl font-semibold">{selectedClass.assignmentDays}</p>
                    </div>
                    <div className="rounded-md bg-muted p-3">
                      <p className="text-xs font-semibold uppercase text-slate-500">Graded Submissions</p>
                      <p className="mt-1 text-2xl font-semibold">{selectedClass.gradedSubmissions}</p>
                    </div>
                    <div className="rounded-md bg-muted p-3">
                      <p className="text-xs font-semibold uppercase text-slate-500">Ungraded</p>
                      <p className="mt-1 text-2xl font-semibold">{selectedClass.ungradedSubmissions}</p>
                    </div>
                  </div>

                  <Table>
                    <thead>
                      <tr>
                        <Th>Day</Th>
                        <Th>Assignments</Th>
                        <Th>Submissions</Th>
                        <Th>Graded</Th>
                        <Th>Ungraded</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedClass.days.map((day) => (
                        <tr key={day.dayId}>
                          <Td>
                            <div className="font-medium">Day {day.dayNumber}: {day.title}</div>
                            <div className="text-xs text-slate-500">{day.published ? "Published" : "Draft"}</div>
                          </Td>
                          <Td>{day.assignments}</Td>
                          <Td>{day.submissions}</Td>
                          <Td>
                            <Badge tone={day.gradedSubmissions > 0 ? "success" : "neutral"}>{day.gradedSubmissions}</Badge>
                          </Td>
                          <Td>
                            <Badge tone={day.ungradedSubmissions > 0 ? "warning" : "success"}>{day.ungradedSubmissions}</Badge>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                  {selectedClass.unlinkedAssignments > 0 ? (
                    <p className="text-sm text-slate-500">
                      {selectedClass.unlinkedAssignments} assignment{selectedClass.unlinkedAssignments === 1 ? "" : "s"} are not linked to a class day.
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-slate-500">Select a class to see assignment and grading health.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function AssignmentWorkflow() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [submissionFile, setSubmissionFile] = useState<File | null>(null);
  const [submissionAssignmentId, setSubmissionAssignmentId] = useState("");
  const [selectedSubmissionClassId, setSelectedSubmissionClassId] = useState("");
  const assignmentForm = useForm<z.infer<typeof assignmentSchema>>({
    resolver: zodResolver(assignmentSchema),
    defaultValues: { points: 100 }
  });
  const selectedClassId = assignmentForm.watch("classId");
  const gradeForm = useForm<{ submissionId: string; grade: number; feedback: string }>({
    defaultValues: { feedback: "" }
  });
  const { data: assignments } = useQuery({
    queryKey: ["assignments"],
    queryFn: () => api.get<ApiList<Assignment>>("/assignments")
  });
  const { data: courses } = useQuery({ queryKey: ["courses"], queryFn: () => api.get<ApiList<Course>>("/courses") });
  const { data: classes } = useQuery({ queryKey: ["classes"], queryFn: () => api.get<{ data: ClassRecord[] }>("/courses/classes/all") });
  const { data: days } = useQuery({
    queryKey: ["class-days", selectedClassId],
    queryFn: () => api.get<{ data: ClassDay[] }>(`/courses/classes/${selectedClassId}/days`),
    enabled: Boolean(selectedClassId)
  });
  const { data: submissions } = useQuery({
    queryKey: ["submissions"],
    queryFn: () => api.get<{ data: Submission[] }>("/assignments/submissions")
  });
  const filteredSubmissions = useMemo(
    () => (submissions?.data ?? []).filter((submission) => !selectedSubmissionClassId || submission.classId === selectedSubmissionClassId),
    [selectedSubmissionClassId, submissions?.data]
  );
  const createAssignment = useMutation({
    mutationFn: (values: z.infer<typeof assignmentSchema>) =>
      api.post<Assignment>("/assignments", {
        ...values,
        courseId: values.courseId || undefined,
        classId: values.classId || undefined,
        dayId: values.dayId || undefined,
        dueDate: new Date(values.dueDate).toISOString()
      }),
    onSuccess: () => {
      assignmentForm.reset({ points: 100 });
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
    }
  });
  const submitAssignment = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      form.append("assignmentId", submissionAssignmentId);
      if (submissionFile) form.append("file", submissionFile);
      return api.post("/assignments/submissions", form);
    },
    onSuccess: () => {
      setSubmissionFile(null);
      setSubmissionAssignmentId("");
      queryClient.invalidateQueries({ queryKey: ["submissions"] });
    }
  });
  const gradeSubmission = useMutation({
    mutationFn: (values: { submissionId: string; grade: number; feedback: string }) =>
      api.put(`/assignments/submissions/${values.submissionId}/grade`, {
        grade: values.grade,
        feedback: values.feedback
      }),
    onSuccess: () => {
      gradeForm.reset({ feedback: "" });
      queryClient.invalidateQueries({ queryKey: ["submissions"] });
    }
  });

  return (
    <>
      <SectionHeader title="Assignments" description="Assignment creation, submissions, and grading workflow." />
      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <div className="space-y-6">
          {user?.role !== "student" ? (
            <Card>
              <CardHeader>
                <CardTitle>Create Assignment</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-3" onSubmit={assignmentForm.handleSubmit((values) => createAssignment.mutate(values))}>
                  {user?.role === "admin" ? (
                    <select className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm" {...assignmentForm.register("courseId")}>
                      <option value="">Course-level assignment</option>
                      {(courses?.data ?? []).map((course) => (
                        <option key={course.id} value={course.id}>
                          {course.title}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <select className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm" {...assignmentForm.register("classId")}>
                    <option value="">Select assigned class</option>
                    {(classes?.data ?? []).map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.courseTitle} / {item.room}
                      </option>
                    ))}
                  </select>
                  <select className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm" {...assignmentForm.register("dayId")}>
                    <option value="">Select day</option>
                    {(days?.data ?? []).map((day) => (
                      <option key={day._id} value={day._id}>
                        Day {day.dayNumber}: {day.title}
                      </option>
                    ))}
                  </select>
                  <Input placeholder="Title" {...assignmentForm.register("title")} />
                  <Textarea placeholder="Description" {...assignmentForm.register("description")} />
                  <Input type="datetime-local" {...assignmentForm.register("dueDate")} />
                  <Input type="number" placeholder="Points" {...assignmentForm.register("points")} />
                  <Button className="w-full" disabled={createAssignment.isPending}>
                    <Plus size={16} />
                    Save assignment
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : null}
          {user?.role === "student" ? (
            <Card>
              <CardHeader>
                <CardTitle>Submit Work</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <select
                  className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                  value={submissionAssignmentId}
                  onChange={(event) => setSubmissionAssignmentId(event.target.value)}
                >
                  <option value="">Select assignment</option>
                  {(assignments?.data ?? []).map((assignment) => (
                    <option key={assignment.id} value={assignment.id}>
                      {assignment.title}
                    </option>
                  ))}
                </select>
                <Input type="file" onChange={(event) => setSubmissionFile(event.target.files?.[0] ?? null)} />
                <Button className="w-full" disabled={!submissionAssignmentId || !submissionFile || submitAssignment.isPending} onClick={() => submitAssignment.mutate()}>
                  <FileUp size={16} />
                  Upload submission
                </Button>
              </CardContent>
            </Card>
          ) : null}
          {user?.role !== "student" ? (
            <Card>
              <CardHeader>
                <CardTitle>Grade Submission</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-3" onSubmit={gradeForm.handleSubmit((values) => gradeSubmission.mutate(values))}>
                  <select className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm" {...gradeForm.register("submissionId")}>
                    <option value="">Select submission</option>
                    {filteredSubmissions.map((submission) => (
                      <option key={submission.id} value={submission.id}>
                        {submission.studentName} - {submission.assignmentTitle}
                      </option>
                    ))}
                  </select>
                  <Input type="number" placeholder="Grade" {...gradeForm.register("grade", { valueAsNumber: true })} />
                  <Textarea placeholder="Feedback" {...gradeForm.register("feedback")} />
                  <Button className="w-full" disabled={gradeSubmission.isPending}>
                    <Star size={16} />
                    Save grade
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : null}
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Assignments</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <thead>
                  <tr>
                    <Th>Title</Th>
                  <Th>Course</Th>
                  <Th>Class</Th>
                  <Th>Due</Th>
                    <Th>Points</Th>
                  </tr>
                </thead>
                <tbody>
                  {(assignments?.data ?? []).map((assignment) => (
                    <tr key={assignment.id}>
                      <Td>
                        <div className="font-medium">{assignment.title}</div>
                        <div className="text-xs text-slate-500">{assignment.description}</div>
                      </Td>
                      <Td>{assignment.courseTitle}</Td>
                      <Td>{assignment.classRoom ?? ""}</Td>
                      <Td>{new Date(assignment.dueDate).toLocaleString()}</Td>
                      <Td>{assignment.points}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle>Submissions</CardTitle>
                {user?.role !== "student" ? (
                  <select
                    className="h-10 rounded-md border border-border bg-white px-3 text-sm"
                    value={selectedSubmissionClassId}
                    onChange={(event) => setSelectedSubmissionClassId(event.target.value)}
                  >
                    <option value="">All assigned classes</option>
                    {(classes?.data ?? []).map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.courseTitle} / {item.room}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <thead>
                  <tr>
                    <Th>Student</Th>
                    <Th>Assignment</Th>
                    <Th>Grade</Th>
                    <Th>Submitted</Th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSubmissions.map((submission) => (
                    <tr key={submission.id}>
                      <Td>{submission.studentName}</Td>
                      <Td>
                        <a className="font-medium text-primary" href={submission.fileUrl} target="_blank" rel="noreferrer">
                          {submission.assignmentTitle}
                        </a>
                        <div className="text-xs text-slate-500">{submission.courseTitle}</div>
                      </Td>
                      <Td>
                        {submission.grade === null || submission.grade === undefined ? (
                          <Badge tone="warning">Pending</Badge>
                        ) : (
                          <Badge tone="success">{submission.grade}</Badge>
                        )}
                      </Td>
                      <Td>{new Date(submission.submittedAt).toLocaleString()}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
