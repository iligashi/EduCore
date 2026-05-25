import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock3, FileText, Mail, Search, UserPlus, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Input, Textarea } from "../components/ui/Input";
import { SectionHeader } from "../components/ui/SectionHeader";
import { Table, Td, Th } from "../components/ui/Table";
import { api } from "../services/api";
import type { AuditLog, ClassRecord, CourseApplication, EmailLog } from "../types";

const stages: { value: CourseApplication["stage"] | ""; label: string }[] = [
  { value: "", label: "All stages" },
  { value: "new", label: "New" },
  { value: "under_review", label: "Under review" },
  { value: "interview", label: "Interview" },
  { value: "accepted", label: "Accepted" },
  { value: "enrolled", label: "Enrolled" },
  { value: "rejected", label: "Rejected" }
];

const stageTone = {
  new: "warning",
  under_review: "info",
  interview: "info",
  accepted: "success",
  enrolled: "success",
  rejected: "danger"
} as const;

const emailTone = {
  sent: "success",
  preview: "warning",
  failed: "danger"
} as const;

function dateLabel(value?: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function readable(value: string) {
  return value.replace(/_/g, " ");
}

export function ApplicationsPage() {
  const [stageFilter, setStageFilter] = useState("");
  const [search, setSearch] = useState("");
  const [actionError, setActionError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [notes, setNotes] = useState("");
  const [interviewAt, setInterviewAt] = useState("");
  const [classId, setClassId] = useState("");
  const queryClient = useQueryClient();
  const path = stageFilter ? `/course-applications?stage=${stageFilter}` : "/course-applications";

  const { data, isLoading } = useQuery({
    queryKey: ["course-applications", stageFilter],
    queryFn: () => api.get<{ data: CourseApplication[] }>(path)
  });
  const { data: classes } = useQuery({
    queryKey: ["classes"],
    queryFn: () => api.get<{ data: ClassRecord[] }>("/courses/classes/all")
  });

  const applications = useMemo(() => {
    const term = search.trim().toLowerCase();
    const source = data?.data ?? [];
    if (!term) return source;
    return source.filter((application) =>
      [application.fullName, application.email, application.courseTitle, application.phone ?? ""].some((value) =>
        value.toLowerCase().includes(term)
      )
    );
  }, [data?.data, search]);

  const selectedApplication = useMemo(
    () => applications.find((application) => application._id === selectedId) ?? applications[0],
    [applications, selectedId]
  );

  const { data: timeline } = useQuery({
    queryKey: ["application-timeline", selectedApplication?._id],
    queryFn: () => api.get<{ emails: EmailLog[]; audit: AuditLog[] }>(`/course-applications/${selectedApplication!._id}/timeline`),
    enabled: Boolean(selectedApplication?._id)
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, stage, nextNotes, nextInterviewAt }: { id: string; stage: CourseApplication["stage"]; nextNotes?: string; nextInterviewAt?: string }) =>
      api.patch<CourseApplication>(`/course-applications/${id}`, {
        stage,
        notes: nextNotes,
        interviewAt: nextInterviewAt
      }),
    onMutate: () => setActionError(""),
    onSuccess: (application) => {
      setSelectedId(application._id);
      queryClient.invalidateQueries({ queryKey: ["course-applications"] });
      queryClient.invalidateQueries({ queryKey: ["application-timeline", application._id] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Application action failed");
      queryClient.invalidateQueries({ queryKey: ["course-applications"] });
    }
  });

  const enrollMutation = useMutation({
    mutationFn: ({ id, selectedClassId }: { id: string; selectedClassId: string }) =>
      api.post<CourseApplication>(`/course-applications/${id}/enroll`, { classId: selectedClassId }),
    onMutate: () => setActionError(""),
    onSuccess: (application) => {
      setSelectedId(application._id);
      setClassId("");
      queryClient.invalidateQueries({ queryKey: ["course-applications"] });
      queryClient.invalidateQueries({ queryKey: ["classes"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => setActionError(error instanceof Error ? error.message : "Enrollment failed")
  });

  function selectApplication(application: CourseApplication) {
    setSelectedId(application._id);
    setNotes(application.notes ?? "");
    setInterviewAt(application.interviewAt ? new Date(application.interviewAt).toISOString().slice(0, 16) : "");
    setClassId(application.enrolledClassId ?? "");
  }

  function updateStage(stage: CourseApplication["stage"]) {
    if (!selectedApplication) return;
    statusMutation.mutate({
      id: selectedApplication._id,
      stage,
      nextNotes: notes,
      nextInterviewAt: interviewAt ? new Date(interviewAt).toISOString() : ""
    });
  }

  return (
    <>
      <SectionHeader title="Admissions" description="Application pipeline, decision emails, enrollment handoff, and review history." />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <CardTitle>Application Pipeline</CardTitle>
              <div className="grid gap-2 sm:grid-cols-[180px_280px]">
                <select
                  className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                  value={stageFilter}
                  onChange={(event) => setStageFilter(event.target.value)}
                >
                  {stages.map((stage) => (
                    <option key={stage.value || "all"} value={stage.value}>
                      {stage.label}
                    </option>
                  ))}
                </select>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                  <Input className="pl-9" placeholder="Search applications" value={search} onChange={(event) => setSearch(event.target.value)} />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {actionError ? <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{actionError}</p> : null}
            <Table>
              <thead>
                <tr>
                  <Th>Applicant</Th>
                  <Th>Course</Th>
                  <Th>Stage</Th>
                  <Th>Submitted</Th>
                  <Th>Decision</Th>
                </tr>
              </thead>
              <tbody>
                {applications.map((application) => (
                  <tr
                    key={application._id}
                    className={selectedApplication?._id === application._id ? "bg-teal-50/40" : "cursor-pointer hover:bg-slate-50"}
                    onClick={() => selectApplication(application)}
                  >
                    <Td>
                      <div className="font-medium">{application.fullName}</div>
                      <div className="text-xs text-slate-500">{application.email}</div>
                      {application.phone ? <div className="text-xs text-slate-500">{application.phone}</div> : null}
                    </Td>
                    <Td>
                      <div className="font-medium">{application.courseTitle}</div>
                      {application.educationLevel ? <div className="text-xs text-slate-500">{application.educationLevel}</div> : null}
                    </Td>
                    <Td>
                      <Badge tone={stageTone[application.stage]}>{readable(application.stage)}</Badge>
                      {application.interviewAt ? <div className="mt-1 text-xs text-slate-500">{dateLabel(application.interviewAt)}</div> : null}
                    </Td>
                    <Td>{dateLabel(application.createdAt)}</Td>
                    <Td>
                      {application.lastEmailStatus ? <Badge tone={emailTone[application.lastEmailStatus]}>email {application.lastEmailStatus}</Badge> : "Not sent"}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {!isLoading && applications.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                <FileText className="mb-2 text-slate-400" size={28} />
                No applications found.
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Review</CardTitle>
            </CardHeader>
            <CardContent>
              {selectedApplication ? (
                <div className="space-y-4">
                  <div>
                    <p className="font-semibold">{selectedApplication.fullName}</p>
                    <p className="text-sm text-slate-500">{selectedApplication.courseTitle}</p>
                    {selectedApplication.message ? <p className="mt-3 rounded-md bg-muted p-3 text-sm text-slate-700">{selectedApplication.message}</p> : null}
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Interview date</label>
                    <Input type="datetime-local" value={interviewAt} onChange={(event) => setInterviewAt(event.target.value)} />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Admin notes</label>
                    <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
                  </div>
                  <div className="grid gap-2">
                    <Button variant="outline" disabled={statusMutation.isPending} onClick={() => updateStage("under_review")}>
                      <Clock3 size={16} />
                      Mark under review
                    </Button>
                    <Button variant="outline" disabled={statusMutation.isPending} onClick={() => updateStage("interview")}>
                      <Clock3 size={16} />
                      Schedule interview
                    </Button>
                    <Button disabled={statusMutation.isPending || selectedApplication.stage === "accepted"} onClick={() => updateStage("accepted")}>
                      <CheckCircle2 size={16} />
                      Accept & email credentials
                    </Button>
                    <Button variant="danger" disabled={statusMutation.isPending || selectedApplication.stage === "rejected"} onClick={() => updateStage("rejected")}>
                      <XCircle size={16} />
                      Reject & email
                    </Button>
                  </div>
                  <div className="rounded-md border border-border p-3">
                    <p className="mb-2 text-sm font-semibold">Enroll accepted student</p>
                    <select className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm" value={classId} onChange={(event) => setClassId(event.target.value)}>
                      <option value="">Select class</option>
                      {(classes?.data ?? []).map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.courseTitle} / {item.room}
                        </option>
                      ))}
                    </select>
                    <Button
                      className="mt-3 w-full"
                      disabled={!classId || enrollMutation.isPending || !["accepted", "enrolled"].includes(selectedApplication.stage)}
                      onClick={() => enrollMutation.mutate({ id: selectedApplication._id, selectedClassId: classId })}
                    >
                      <UserPlus size={16} />
                      Enroll to class
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">Select an application.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {(timeline?.emails ?? []).slice(0, 4).map((email) => (
                  <div key={email._id} className="rounded-md border border-border p-3 text-sm">
                    <div className="flex items-center gap-2">
                      <Mail size={15} className="text-primary" />
                      <span className="font-medium">{email.subject}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                      <Badge tone={emailTone[email.status]}>{email.status}</Badge>
                      {dateLabel(email.createdAt)}
                    </div>
                  </div>
                ))}
                {(timeline?.audit ?? []).slice(0, 5).map((item) => (
                  <div key={item._id} className="rounded-md bg-muted p-3 text-sm">
                    <p className="font-medium">{readable(item.action)}</p>
                    <p className="text-xs text-slate-500">{dateLabel(item.createdAt)}</p>
                  </div>
                ))}
                {(timeline?.emails ?? []).length === 0 && (timeline?.audit ?? []).length === 0 ? <p className="text-sm text-slate-500">No history yet.</p> : null}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
