import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileUp, Search, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { SectionHeader } from "../components/ui/SectionHeader";
import { Table, Td, Th } from "../components/ui/Table";
import { useAuth } from "../features/auth/AuthProvider";
import { api } from "../services/api";
import type { StudentDocument } from "../types";

const statusTone = {
  pending: "warning",
  approved: "success",
  rejected: "danger"
} as const;

function dateLabel(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function DocumentsPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [title, setTitle] = useState("");
  const [type, setType] = useState("Identity document");
  const [file, setFile] = useState<File | null>(null);
  const [actionError, setActionError] = useState("");
  const queryClient = useQueryClient();
  const path = status ? `/documents?status=${status}` : "/documents";

  const { data, isLoading } = useQuery({
    queryKey: ["student-documents", status],
    queryFn: () => api.get<{ data: StudentDocument[] }>(path)
  });

  const documents = useMemo(() => {
    const term = search.trim().toLowerCase();
    const source = data?.data ?? [];
    if (!term) return source;
    return source.filter((item) =>
      [item.fullName, item.title, item.type, item.originalName].some((value) => value.toLowerCase().includes(term))
    );
  }, [data?.data, search]);

  const uploadMutation = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.append("title", title);
      form.append("type", type);
      if (file) form.append("file", file);
      return api.post<StudentDocument>("/documents", form);
    },
    onMutate: () => setActionError(""),
    onSuccess: () => {
      setTitle("");
      setType("Identity document");
      setFile(null);
      queryClient.invalidateQueries({ queryKey: ["student-documents"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => setActionError(error instanceof Error ? error.message : "Document upload failed")
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, nextStatus }: { id: string; nextStatus: "approved" | "rejected" }) =>
      api.patch<StudentDocument>(`/documents/${id}/review`, { status: nextStatus }),
    onMutate: () => setActionError(""),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-documents"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => setActionError(error instanceof Error ? error.message : "Document review failed")
  });

  return (
    <>
      <SectionHeader
        title="Documents"
        description={user?.role === "admin" ? "Review student documents and approvals." : "Upload required admissions and student documents."}
      />
      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        {user?.role === "student" ? (
          <Card>
            <CardHeader>
              <CardTitle>Upload Document</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input placeholder="Document title" value={title} onChange={(event) => setTitle(event.target.value)} />
              <select className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm" value={type} onChange={(event) => setType(event.target.value)}>
                <option>Identity document</option>
                <option>Transcript</option>
                <option>Certificate</option>
                <option>Contract</option>
                <option>Other</option>
              </select>
              <Input type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
              <Button className="w-full" disabled={!title.trim() || !type.trim() || !file || uploadMutation.isPending} onClick={() => uploadMutation.mutate()}>
                <FileUp size={16} />
                Upload document
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <Card className={user?.role === "student" ? "" : "xl:col-span-2"}>
          <CardHeader>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <CardTitle>{user?.role === "admin" ? "Document Review" : "My Documents"}</CardTitle>
              <div className="grid gap-2 sm:grid-cols-[170px_260px]">
                <select className="h-10 rounded-md border border-border bg-white px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}>
                  <option value="">All statuses</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                  <Input className="pl-9" placeholder="Search documents" value={search} onChange={(event) => setSearch(event.target.value)} />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {actionError ? <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{actionError}</p> : null}
            <Table>
              <thead>
                <tr>
                  {user?.role === "admin" ? <Th>Student</Th> : null}
                  <Th>Document</Th>
                  <Th>Type</Th>
                  <Th>Status</Th>
                  <Th>Uploaded</Th>
                  {user?.role === "admin" ? <Th>Actions</Th> : null}
                </tr>
              </thead>
              <tbody>
                {documents.map((document) => (
                  <tr key={document._id}>
                    {user?.role === "admin" ? <Td>{document.fullName}</Td> : null}
                    <Td>
                      <a className="font-medium text-primary" href={document.fileUrl} target="_blank" rel="noreferrer">
                        {document.title}
                      </a>
                      <div className="text-xs text-slate-500">{document.originalName}</div>
                      {document.notes ? <div className="mt-1 text-xs text-red-700">{document.notes}</div> : null}
                    </Td>
                    <Td>{document.type}</Td>
                    <Td>
                      <Badge tone={statusTone[document.status]}>{document.status}</Badge>
                    </Td>
                    <Td>{dateLabel(document.createdAt)}</Td>
                    {user?.role === "admin" ? (
                      <Td>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            disabled={reviewMutation.isPending || document.status === "approved"}
                            onClick={() => reviewMutation.mutate({ id: document._id, nextStatus: "approved" })}
                          >
                            <CheckCircle2 size={14} />
                            Approve
                          </Button>
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            disabled={reviewMutation.isPending || document.status === "rejected"}
                            onClick={() => reviewMutation.mutate({ id: document._id, nextStatus: "rejected" })}
                          >
                            <XCircle size={14} />
                            Reject
                          </Button>
                        </div>
                      </Td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </Table>
            {!isLoading && documents.length === 0 ? <p className="rounded-md border border-dashed border-border p-6 text-sm text-slate-500">No documents found.</p> : null}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
