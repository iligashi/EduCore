import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock3, FileText, Search, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { SectionHeader } from "../components/ui/SectionHeader";
import { Table, Td, Th } from "../components/ui/Table";
import { api } from "../services/api";
import type { CourseApplication } from "../types";

const statusTone = {
  pending: "warning",
  reviewed: "info",
  accepted: "success",
  rejected: "danger"
} as const;

const emailTone = {
  sent: "success",
  preview: "warning",
  failed: "danger"
} as const;

function submittedAt(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function ApplicationsPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [actionError, setActionError] = useState("");
  const queryClient = useQueryClient();
  const path = statusFilter ? `/course-applications?status=${statusFilter}` : "/course-applications";

  const { data, isLoading } = useQuery({
    queryKey: ["course-applications", statusFilter],
    queryFn: () => api.get<{ data: CourseApplication[] }>(path)
  });

  const applications = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return data?.data ?? [];
    return (data?.data ?? []).filter((application) =>
      [application.fullName, application.email, application.courseTitle, application.phone ?? ""].some((value) =>
        value.toLowerCase().includes(term)
      )
    );
  }, [data?.data, search]);

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: CourseApplication["status"] }) =>
      api.patch<CourseApplication>(`/course-applications/${id}`, { status }),
    onMutate: () => {
      setActionError("");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["course-applications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Application action failed");
      queryClient.invalidateQueries({ queryKey: ["course-applications"] });
    }
  });

  return (
    <>
      <SectionHeader title="Course Applications" description="Public course applications submitted from the front page. Admins only." />
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle>Application Inbox</CardTitle>
            <div className="grid gap-2 sm:grid-cols-[180px_280px]">
              <select
                className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="">All statuses</option>
                <option value="pending">Pending</option>
                <option value="reviewed">Reviewed</option>
                <option value="accepted">Accepted</option>
                <option value="rejected">Rejected</option>
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
                <Th>Message</Th>
                <Th>Status</Th>
                <Th>Submitted</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {applications.map((application) => (
                <tr key={application._id}>
                  <Td>
                    <div className="font-medium">{application.fullName}</div>
                    <div className="text-xs text-slate-500">{application.email}</div>
                    {application.phone ? <div className="text-xs text-slate-500">{application.phone}</div> : null}
                  </Td>
                  <Td>
                    <div className="font-medium">{application.courseTitle}</div>
                    {application.educationLevel ? <div className="text-xs text-slate-500">{application.educationLevel}</div> : null}
                  </Td>
                  <Td className="max-w-sm text-sm text-slate-600">{application.message || "No message added."}</Td>
                  <Td>
                    <Badge tone={statusTone[application.status]}>{application.status}</Badge>
                    {application.lastEmailStatus ? (
                      <div className="mt-2">
                        <Badge tone={emailTone[application.lastEmailStatus]}>email {application.lastEmailStatus}</Badge>
                      </div>
                    ) : null}
                    {application.lastEmailError ? <div className="mt-1 max-w-44 text-xs text-red-700">{application.lastEmailError}</div> : null}
                  </Td>
                  <Td>{submittedAt(application.createdAt)}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={statusMutation.isPending}
                        onClick={() => statusMutation.mutate({ id: application._id, status: "reviewed" })}
                      >
                        <Clock3 size={14} />
                        Review
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={statusMutation.isPending || application.status === "accepted"}
                        onClick={() => statusMutation.mutate({ id: application._id, status: "accepted" })}
                      >
                        <CheckCircle2 size={14} />
                        Accept & email
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        disabled={statusMutation.isPending || application.status === "rejected"}
                        onClick={() => statusMutation.mutate({ id: application._id, status: "rejected" })}
                      >
                        <XCircle size={14} />
                        Reject & email
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {!isLoading && applications.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              <FileText className="mb-2 text-slate-400" size={28} />
              No course applications found.
            </div>
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}
