import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Award, CheckCircle2, FileText, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { SectionHeader } from "../components/ui/SectionHeader";
import { Table, Td, Th } from "../components/ui/Table";
import { useAuth } from "../features/auth/AuthProvider";
import { api } from "../services/api";
import type { Certificate, ClassRecord, GradebookRow } from "../types";

function gradeLabel(value: number | null) {
  return value === null || value === undefined ? "No grades" : `${value}%`;
}

function dateLabel(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function GradebookPage() {
  const { user } = useAuth();
  const [classId, setClassId] = useState("");
  const [search, setSearch] = useState("");
  const [actionError, setActionError] = useState("");
  const queryClient = useQueryClient();
  const gradebookPath = classId ? `/gradebook?classId=${classId}` : "/gradebook";

  const { data: classes } = useQuery({
    queryKey: ["classes"],
    queryFn: () => api.get<{ data: ClassRecord[] }>("/courses/classes/all"),
    enabled: user?.role !== "student"
  });
  const { data: gradebook } = useQuery({
    queryKey: ["gradebook", classId],
    queryFn: () => api.get<{ data: GradebookRow[] }>(gradebookPath)
  });
  const { data: certificates } = useQuery({
    queryKey: ["certificates"],
    queryFn: () => api.get<{ data: Certificate[] }>("/gradebook/certificates")
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const source = gradebook?.data ?? [];
    if (!term) return source;
    return source.filter((row) => [row.studentName, row.email, row.courseTitle, row.room].some((value) => value.toLowerCase().includes(term)));
  }, [gradebook?.data, search]);

  const issueCertificate = useMutation({
    mutationFn: (row: GradebookRow) => api.post<Certificate>("/gradebook/certificates", { studentId: row.studentId, classId: row.classId }),
    onMutate: () => setActionError(""),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["certificates"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => setActionError(error instanceof Error ? error.message : "Certificate could not be issued")
  });

  const certificateKeys = useMemo(
    () => new Set((certificates?.data ?? []).filter((item) => item.status === "issued").map((item) => `${item.studentId}:${item.classId}`)),
    [certificates?.data]
  );

  return (
    <>
      <SectionHeader
        title="Gradebook"
        description={user?.role === "student" ? "Your grades and issued certificates." : "Class grades, completion status, and certificates."}
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <CardTitle>Class Gradebook</CardTitle>
              <div className="grid gap-2 sm:grid-cols-[240px_260px]">
                {user?.role !== "student" ? (
                  <select className="h-10 rounded-md border border-border bg-white px-3 text-sm" value={classId} onChange={(event) => setClassId(event.target.value)}>
                    <option value="">All classes</option>
                    {(classes?.data ?? []).map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.courseTitle} / {item.room}
                      </option>
                    ))}
                  </select>
                ) : null}
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                  <Input className="pl-9" placeholder="Search gradebook" value={search} onChange={(event) => setSearch(event.target.value)} />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {actionError ? <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{actionError}</p> : null}
            <Table>
              <thead>
                <tr>
                  <Th>Student</Th>
                  <Th>Class</Th>
                  <Th>Progress</Th>
                  <Th>Average</Th>
                  <Th>Certificate</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const hasCertificate = certificateKeys.has(`${row.studentId}:${row.classId}`);
                  return (
                    <tr key={`${row.studentId}-${row.classId}`}>
                      <Td>
                        <div className="font-medium">{row.studentName}</div>
                        <div className="text-xs text-slate-500">{row.email}</div>
                      </Td>
                      <Td>
                        <div className="font-medium">{row.courseTitle}</div>
                        <div className="text-xs text-slate-500">{row.room}</div>
                      </Td>
                      <Td>
                        <div className="text-sm">
                          {row.gradedSubmissions}/{row.totalAssignments} graded
                        </div>
                        <div className="text-xs text-slate-500">{row.submittedAssignments} submitted</div>
                      </Td>
                      <Td>
                        <Badge tone={row.averageGrade === null ? "neutral" : row.averageGrade >= 60 ? "success" : "danger"}>{gradeLabel(row.averageGrade)}</Badge>
                      </Td>
                      <Td>
                        {hasCertificate ? (
                          <Badge tone="success">issued</Badge>
                        ) : row.certificateEligible ? (
                          user?.role === "student" ? (
                            <Badge tone="warning">not issued</Badge>
                          ) : (
                            <Button size="sm" disabled={issueCertificate.isPending} onClick={() => issueCertificate.mutate(row)}>
                              <Award size={14} />
                              Issue
                            </Button>
                          )
                        ) : (
                          <Badge tone="warning">not ready</Badge>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            {rows.length === 0 ? <p className="rounded-md border border-dashed border-border p-6 text-sm text-slate-500">No gradebook rows found.</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Certificates</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(certificates?.data ?? []).map((certificate) => (
                <div key={certificate._id} className="rounded-md border border-border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <FileText className="mt-1 text-primary" size={18} />
                    <Badge tone={certificate.status === "issued" ? "success" : "danger"}>{certificate.status}</Badge>
                  </div>
                  <p className="mt-3 font-semibold">{certificate.courseTitle}</p>
                  <p className="mt-1 text-sm text-slate-600">{certificate.studentName}</p>
                  <div className="mt-3 grid gap-2 text-sm text-slate-600">
                    <div className="flex items-center justify-between">
                      <span>Code</span>
                      <span className="font-medium text-slate-900">{certificate.verificationCode}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Issued</span>
                      <span>{dateLabel(certificate.issuedAt)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Grade</span>
                      <span>{gradeLabel(certificate.finalGrade)}</span>
                    </div>
                  </div>
                  {certificate.status === "issued" ? (
                    <Button className="mt-3 w-full" variant="outline" onClick={() => window.print()}>
                      <CheckCircle2 size={16} />
                      Print
                    </Button>
                  ) : null}
                </div>
              ))}
              {(certificates?.data ?? []).length === 0 ? <p className="text-sm text-slate-500">No certificates issued yet.</p> : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
