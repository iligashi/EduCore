import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileUp, Plus, Star } from "lucide-react";
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
  assignmentTitle: string;
  studentName: string;
  courseTitle: string;
  fileUrl: string;
  grade?: number | null;
  feedback?: string;
  submittedAt: string;
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
  const queryClient = useQueryClient();
  const [submissionFile, setSubmissionFile] = useState<File | null>(null);
  const [submissionAssignmentId, setSubmissionAssignmentId] = useState("");
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
                    {(submissions?.data ?? []).map((submission) => (
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
              <CardTitle>Submissions</CardTitle>
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
                  {(submissions?.data ?? []).map((submission) => (
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
