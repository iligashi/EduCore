import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  CheckCircle,
  ClipboardCheck,
  FileUp,
  FileText,
  History,
  MessageSquare,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
  XCircle
} from "lucide-react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Input, Textarea } from "../components/ui/Input";
import { SectionHeader } from "../components/ui/SectionHeader";
import { useAuth } from "../features/auth/AuthProvider";
import { api } from "../services/api";
import type { CopilotDocument, CopilotDraft, CopilotMessage, CopilotMode, CopilotThread, Role } from "../types";
import { cn } from "../utils/cn";

interface CopilotContextResponse {
  context: {
    summary: string;
    capabilities: string[];
    suggestions: string[];
    metrics: Record<string, number | string | null>;
  };
}

interface ChatResponse {
  thread: CopilotThread;
  messages: CopilotMessage[];
  context: {
    summary: string;
    metrics: Record<string, number | string | null>;
    suggestions: string[];
  };
}

interface AuditResponse {
  messages: CopilotMessage[];
  drafts: CopilotDraft[];
}

const modeCopy: Record<CopilotMode, string> = {
  ask: "Ask",
  tutor: "Tutor",
  draft: "Draft",
  admin: "Admin",
  instructor: "Instructor"
};

function allowedModes(role?: string): CopilotMode[] {
  if (role === "student") return ["ask", "tutor", "draft"];
  if (role === "instructor") return ["ask", "instructor", "draft"];
  return ["ask", "admin", "draft"];
}

function draftType(role?: string): CopilotDraft["type"] {
  if (role === "student") return "note";
  if (role === "instructor") return "feedback";
  return "admin_intervention";
}

function starterPrompt(role?: string) {
  if (role === "student") return "What should I work on next?";
  if (role === "instructor") return "Which students or submissions need my attention?";
  return "Summarize today's highest priority class health risks.";
}

function formatTime(value?: string) {
  return value ? new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
}

export function CopilotPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<CopilotMode>(allowedModes(user?.role)[0]);
  const [message, setMessage] = useState(starterPrompt(user?.role));
  const [selectedThreadId, setSelectedThreadId] = useState("");
  const [documentTitle, setDocumentTitle] = useState("");
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentTargetRole, setDocumentTargetRole] = useState<Role>("student");

  const { data: context } = useQuery({
    queryKey: ["copilot-context", mode],
    queryFn: () => api.get<CopilotContextResponse>(`/copilot/context?mode=${mode}`)
  });
  const { data: threads } = useQuery({
    queryKey: ["copilot-threads"],
    queryFn: () => api.get<{ data: CopilotThread[] }>("/copilot/threads")
  });
  const { data: threadMessages } = useQuery({
    queryKey: ["copilot-messages", selectedThreadId],
    queryFn: () => api.get<{ data: CopilotMessage[] }>(`/copilot/threads/${selectedThreadId}/messages`),
    enabled: Boolean(selectedThreadId)
  });
  const { data: drafts } = useQuery({
    queryKey: ["copilot-drafts"],
    queryFn: () => api.get<{ data: CopilotDraft[] }>("/copilot/drafts")
  });
  const { data: documents } = useQuery({
    queryKey: ["copilot-documents"],
    queryFn: () => api.get<{ data: CopilotDocument[] }>("/copilot/documents")
  });
  const { data: audit } = useQuery({
    queryKey: ["copilot-audit"],
    queryFn: () => api.get<AuditResponse>("/copilot/audit"),
    enabled: user?.role === "admin"
  });

  const chat = useMutation({
    mutationFn: (input: { message: string; mode: CopilotMode; threadId?: string }) => api.post<ChatResponse>("/copilot/chat", input),
    onSuccess: (result) => {
      setSelectedThreadId(result.thread._id);
      setMessage("");
      queryClient.invalidateQueries({ queryKey: ["copilot-threads"] });
      queryClient.invalidateQueries({ queryKey: ["copilot-messages", result.thread._id] });
      queryClient.invalidateQueries({ queryKey: ["copilot-audit"] });
    }
  });

  const saveDraft = useMutation({
    mutationFn: (input: { title: string; content: string }) =>
      api.post<CopilotDraft>("/copilot/drafts", {
        type: draftType(user?.role),
        title: input.title,
        content: input.content,
        metadata: { mode, threadId: selectedThreadId || undefined }
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["copilot-drafts"] });
      queryClient.invalidateQueries({ queryKey: ["copilot-audit"] });
    }
  });

  const updateDraft = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "approved" | "rejected" }) =>
      api.patch<CopilotDraft>(`/copilot/drafts/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["copilot-drafts"] });
      queryClient.invalidateQueries({ queryKey: ["copilot-audit"] });
    }
  });

  const uploadDocument = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.append("title", documentTitle);
      form.append("visibility", "role");
      form.append("targetRole", user?.role === "instructor" ? "student" : documentTargetRole);
      if (documentFile) form.append("file", documentFile);
      return api.post<CopilotDocument>("/copilot/documents", form);
    },
    onSuccess: () => {
      setDocumentTitle("");
      setDocumentFile(null);
      queryClient.invalidateQueries({ queryKey: ["copilot-documents"] });
      queryClient.invalidateQueries({ queryKey: ["copilot-context"] });
    }
  });

  const currentMessages = threadMessages?.data ?? [];
  const visibleThreads = threads?.data ?? [];
  const pendingDrafts = (drafts?.data ?? []).filter((item) => item.status === "pending");
  const knowledgeDocuments = documents?.data ?? [];
  const metrics = context?.context.metrics ?? {};
  const suggestions = context?.context.suggestions ?? [];
  const canSend = message.trim().length >= 2 && !chat.isPending;

  const metricsList = useMemo(
    () =>
      Object.entries(metrics)
        .filter(([, value]) => value !== null && value !== undefined)
        .slice(0, 4),
    [metrics]
  );

  function submitPrompt(prompt = message) {
    const trimmed = prompt.trim();
    if (trimmed.length < 2) return;
    chat.mutate({ message: trimmed, mode, threadId: selectedThreadId || undefined });
  }

  return (
    <>
      <SectionHeader
        title="EduCore Copilot"
        description="Role-aware AI support for learning, teaching, operations, documents, and approved drafts."
      />

      <div className="grid gap-6 xl:grid-cols-[280px_1fr_340px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Mode</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {allowedModes(user?.role).map((item) => (
                <button
                  key={item}
                  type="button"
                  className={cn(
                    "flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm font-medium",
                    mode === item ? "border-primary bg-teal-50 text-primary" : "border-border bg-white text-slate-600 hover:bg-muted"
                  )}
                  onClick={() => setMode(item)}
                >
                  {modeCopy[item]}
                  {mode === item ? <CheckCircle size={16} /> : null}
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Context</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2">
                {metricsList.map(([key, value]) => (
                  <div key={key} className="rounded-md bg-muted p-3">
                    <p className="text-xs font-semibold uppercase text-slate-500">{key.replace(/([A-Z])/g, " $1")}</p>
                    <p className="mt-1 text-xl font-semibold">{value}</p>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-600">{context?.context.summary}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Conversations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button type="button" className="w-full" variant="outline" onClick={() => setSelectedThreadId("")}>
                <MessageSquare size={16} />
                New chat
              </Button>
              {visibleThreads.map((thread) => (
                <button
                  key={thread._id}
                  type="button"
                  className={cn(
                    "w-full rounded-md border p-3 text-left text-sm",
                    selectedThreadId === thread._id ? "border-primary bg-teal-50" : "border-border bg-white hover:bg-muted"
                  )}
                  onClick={() => setSelectedThreadId(thread._id)}
                >
                  <span className="block truncate font-medium">{thread.title}</span>
                  <span className="mt-1 block text-xs text-slate-500">{formatTime(thread.lastMessageAt)}</span>
                </button>
              ))}
              {visibleThreads.length === 0 ? <p className="text-sm text-slate-500">No Copilot chats yet.</p> : null}
            </CardContent>
          </Card>
        </div>

        <Card className="min-h-[720px]">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle>Chat</CardTitle>
              <Badge tone={user?.role === "admin" ? "danger" : user?.role === "instructor" ? "warning" : "info"}>
                {user?.role}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="flex min-h-[650px] flex-col">
            <div className="mb-4 flex flex-wrap gap-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="rounded-md border border-border bg-white px-3 py-2 text-left text-xs font-medium text-slate-600 hover:border-primary hover:text-primary"
                  onClick={() => {
                    setMessage(suggestion);
                    submitPrompt(suggestion);
                  }}
                >
                  {suggestion}
                </button>
              ))}
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto rounded-md border border-border bg-slate-50 p-4">
              {currentMessages.map((item) => (
                <div key={item._id} className={cn("flex", item.role === "user" ? "justify-end" : "justify-start")}>
                  <div className={cn("max-w-[86%] rounded-lg p-4 text-sm shadow-soft", item.role === "user" ? "bg-primary text-white" : "bg-white text-slate-800")}>
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase opacity-75">
                      {item.role === "assistant" ? <Bot size={15} /> : <MessageSquare size={15} />}
                      {item.role === "assistant" ? `Copilot / ${item.provider}` : "You"}
                    </div>
                    <p className="whitespace-pre-wrap leading-7">{item.content}</p>
                    {item.citations?.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {item.citations.slice(0, 6).map((citation) => (
                          <Badge key={`${item._id}-${citation.id}`} tone="neutral">
                            {citation.type}: {citation.title}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                    {item.role === "assistant" ? (
                      <div className="mt-3">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={saveDraft.isPending}
                          onClick={() => saveDraft.mutate({ title: item.content.slice(0, 70) || "Copilot draft", content: item.content })}
                        >
                          <Save size={15} />
                          Save draft
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
              {currentMessages.length === 0 ? (
                <div className="flex h-full min-h-[320px] items-center justify-center text-center">
                  <div>
                    <Sparkles className="mx-auto text-primary" size={34} />
                    <p className="mt-3 font-medium">Ask Copilot about your EduCore data.</p>
                    <p className="mt-1 max-w-md text-sm text-slate-500">
                      It will use role-safe context and save official actions as drafts for approval.
                    </p>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-4 space-y-3">
              <Textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Ask for a study plan, class risk summary, draft feedback, or document summary." />
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-slate-500">Official actions stay as drafts until approved.</p>
                <Button type="button" disabled={!canSend} onClick={() => submitPrompt()}>
                  <Send size={16} />
                  Send
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Approval Drafts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {pendingDrafts.slice(0, 5).map((draft) => (
                <div key={draft._id} className="rounded-md border border-border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{draft.title}</p>
                    <Badge tone="warning">{draft.type}</Badge>
                  </div>
                  <p className="mt-2 max-h-28 overflow-hidden text-sm leading-6 text-slate-600">{draft.content}</p>
                  <div className="mt-3 flex gap-2">
                    <Button type="button" variant="outline" size="sm" disabled={updateDraft.isPending} onClick={() => updateDraft.mutate({ id: draft._id, status: "approved" })}>
                      <CheckCircle size={15} />
                      Approve
                    </Button>
                    <Button type="button" variant="outline" size="sm" disabled={updateDraft.isPending} onClick={() => updateDraft.mutate({ id: draft._id, status: "rejected" })}>
                      <XCircle size={15} />
                      Reject
                    </Button>
                  </div>
                </div>
              ))}
              {pendingDrafts.length === 0 ? <p className="text-sm text-slate-500">No pending drafts.</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Capabilities</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(context?.context.capabilities ?? []).map((item) => (
                <div key={item} className="flex gap-2 text-sm text-slate-700">
                  <ShieldCheck size={16} className="mt-0.5 shrink-0 text-primary" />
                  <span>{item}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Knowledge</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {user?.role !== "student" ? (
                <div className="space-y-2 rounded-md border border-border p-3">
                  <Input placeholder="Document title" value={documentTitle} onChange={(event) => setDocumentTitle(event.target.value)} />
                  {user?.role === "admin" ? (
                    <select
                      className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                      value={documentTargetRole}
                      onChange={(event) => setDocumentTargetRole(event.target.value as Role)}
                    >
                      <option value="student">Students</option>
                      <option value="instructor">Instructors</option>
                      <option value="admin">Admins</option>
                    </select>
                  ) : null}
                  <Input type="file" onChange={(event) => setDocumentFile(event.target.files?.[0] ?? null)} />
                  <Button
                    type="button"
                    className="w-full"
                    variant="outline"
                    disabled={!documentTitle.trim() || !documentFile || uploadDocument.isPending}
                    onClick={() => uploadDocument.mutate()}
                  >
                    <FileUp size={15} />
                    Add document
                  </Button>
                </div>
              ) : null}
              {knowledgeDocuments.slice(0, 5).map((document) => (
                <a key={document._id} href={document.fileUrl} target="_blank" rel="noreferrer" className="block rounded-md border border-border p-3 text-sm hover:border-primary">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{document.title}</span>
                    <Badge tone={document.status === "ready" ? "success" : "neutral"}>{document.status === "ready" ? "indexed" : "file"}</Badge>
                  </div>
                  <span className="mt-1 block text-xs text-slate-500">{document.originalName}</span>
                </a>
              ))}
              {knowledgeDocuments.length === 0 ? <p className="text-sm text-slate-500">No Copilot documents yet.</p> : null}
            </CardContent>
          </Card>

          {user?.role === "admin" ? (
            <Card>
              <CardHeader>
                <CardTitle>AI Audit</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-md bg-muted p-3">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
                    <History size={14} />
                    Recent Messages
                  </div>
                  <p className="mt-1 text-2xl font-semibold">{audit?.messages.length ?? 0}</p>
                </div>
                <div className="rounded-md bg-muted p-3">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
                    <ClipboardCheck size={14} />
                    Draft Decisions
                  </div>
                  <p className="mt-1 text-2xl font-semibold">{audit?.drafts.length ?? 0}</p>
                </div>
                {(audit?.drafts ?? []).slice(0, 4).map((draft) => (
                  <div key={draft._id} className="rounded-md border border-border p-3 text-sm">
                    <div className="flex items-center gap-2">
                      <FileText size={15} className="text-primary" />
                      <p className="font-medium">{draft.title}</p>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{draft.status}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
