import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, FileText, FileUp, Image, Link, Plus, Save, Star, Trash2, Type } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Input, Textarea } from "../components/ui/Input";
import { SectionHeader } from "../components/ui/SectionHeader";
import { Table, Td, Th } from "../components/ui/Table";
import { api } from "../services/api";
import type { Assignment, ClassDay, ClassRecord } from "../types";

interface Submission {
  id: string;
  assignmentTitle: string;
  studentName: string;
  courseTitle: string;
  classRoom?: string;
  dayId?: string;
  grade?: number | null;
  submittedAt: string;
}

const daySchema = z.object({
  title: z.string().min(2),
  dayNumber: z.coerce.number().int().min(1).optional(),
  content: z.string().optional().default(""),
  published: z.coerce.boolean().default(false)
});

const assignmentSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional().default(""),
  dueDate: z.string().min(1),
  points: z.coerce.number().int().min(1).default(100)
});

function classLabel(item: ClassRecord) {
  return `${item.courseTitle} / ${item.room}`;
}

export function ClassStudioPage() {
  const queryClient = useQueryClient();
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedDayId, setSelectedDayId] = useState("");
  const [assetFile, setAssetFile] = useState<File | null>(null);
  const [backupTargetClassId, setBackupTargetClassId] = useState("");
  const [assetUrls, setAssetUrls] = useState<string[]>([]);
  const [blocks, setBlocks] = useState<{ type: string; text?: string; url?: string }[]>([]);
  const [blockType, setBlockType] = useState("paragraph");
  const [blockText, setBlockText] = useState("");

  const dayForm = useForm<z.infer<typeof daySchema>>({
    resolver: zodResolver(daySchema),
    defaultValues: { published: false, content: "" }
  });
  const assignmentForm = useForm<z.infer<typeof assignmentSchema>>({
    resolver: zodResolver(assignmentSchema),
    defaultValues: { points: 100 }
  });
  const gradeForm = useForm<{ submissionId: string; grade: number; feedback: string }>({
    defaultValues: { feedback: "" }
  });

  const { data: classes } = useQuery({
    queryKey: ["classes"],
    queryFn: () => api.get<{ data: ClassRecord[] }>("/courses/classes/all")
  });

  const selectedClass = useMemo(
    () => (classes?.data ?? []).find((item) => item.id === selectedClassId),
    [classes?.data, selectedClassId]
  );

  const { data: days } = useQuery({
    queryKey: ["class-days", selectedClassId],
    queryFn: () => api.get<{ data: ClassDay[] }>(`/courses/classes/${selectedClassId}/days`),
    enabled: Boolean(selectedClassId)
  });

  const selectedDay = useMemo(() => (days?.data ?? []).find((day) => day._id === selectedDayId), [days?.data, selectedDayId]);

  const { data: assignments } = useQuery({
    queryKey: ["assignments"],
    queryFn: () => api.get<{ data: Assignment[] }>("/assignments")
  });

  const { data: submissions } = useQuery({
    queryKey: ["submissions"],
    queryFn: () => api.get<{ data: Submission[] }>("/assignments/submissions")
  });

  useEffect(() => {
    if (!selectedDay) return;
    dayForm.reset({
      title: selectedDay.title,
      dayNumber: selectedDay.dayNumber,
      content: selectedDay.content,
      published: selectedDay.published
    });
    setAssetUrls(selectedDay.assets ?? []);
    setBlocks(selectedDay.blocks ?? []);
  }, [dayForm, selectedDay]);

  const saveDay = useMutation({
    mutationFn: async (values: z.infer<typeof daySchema>) => {
      const payload = {
        ...values,
        assets: assetUrls,
        blocks
      };
      if (selectedDayId) return api.put<ClassDay>(`/courses/classes/days/${selectedDayId}`, payload);
      return api.post<ClassDay>(`/courses/classes/${selectedClassId}/days`, payload);
    },
    onSuccess: (day) => {
      setSelectedDayId(day._id);
      queryClient.invalidateQueries({ queryKey: ["class-days", selectedClassId] });
    }
  });

  const uploadAsset = useMutation({
    mutationFn: async () => {
      if (!assetFile) return null;
      const form = new FormData();
      form.append("file", assetFile);
      return api.post<{ url: string }>("/cms/assets", form);
    },
    onSuccess: (result) => {
      if (result?.url) {
        setAssetUrls((current) => [...current, result.url]);
        setBlocks((current) => [...current, { type: result.url.match(/\.(png|jpg|jpeg|gif|webp)$/i) ? "image" : "file", url: result.url }]);
      }
      setAssetFile(null);
    }
  });

  const createAssignment = useMutation({
    mutationFn: (values: z.infer<typeof assignmentSchema>) =>
      api.post<Assignment>("/assignments", {
        ...values,
        classId: selectedClassId,
        dayId: selectedDayId,
        dueDate: new Date(values.dueDate).toISOString()
      }),
    onSuccess: () => {
      assignmentForm.reset({ points: 100 });
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
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

  const backupClass = useMutation({
    mutationFn: () =>
      api.post(`/courses/classes/${selectedClassId}/backup`, {
        targetClassId: backupTargetClassId || undefined
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["class-days"] });
    }
  });

  const dayAssignments = (assignments?.data ?? []).filter((assignment) => assignment.dayId === selectedDayId);
  const daySubmissions = (submissions?.data ?? []).filter((submission) => !selectedDayId || submission.dayId === selectedDayId);

  return (
    <>
      <SectionHeader title="Class Studio" description="Edit assigned class days, content blocks, assets, backups, day assignments, and grading." />
      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Assigned Class</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <select
                className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                value={selectedClassId}
                onChange={(event) => {
                  setSelectedClassId(event.target.value);
                  setSelectedDayId("");
                  dayForm.reset({ published: false, content: "" });
                  setAssetUrls([]);
                  setBlocks([]);
                }}
              >
                <option value="">Select class</option>
                {(classes?.data ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {classLabel(item)}
                  </option>
                ))}
              </select>
              {selectedClass ? (
                <div className="rounded-md bg-muted p-3 text-sm text-slate-600">
                  <p className="font-medium text-slate-900">{selectedClass.courseTitle}</p>
                  <p>Room: {selectedClass.room}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Days</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(days?.data ?? []).map((day) => (
                <button
                  key={day._id}
                  className={`w-full rounded-md border px-3 py-2 text-left text-sm ${selectedDayId === day._id ? "border-primary bg-teal-50" : "border-border bg-white"}`}
                  onClick={() => setSelectedDayId(day._id)}
                >
                  <span className="font-medium">Day {day.dayNumber}: {day.title}</span>
                  <span className="mt-1 block text-xs text-slate-500">{day.published ? "Published" : "Draft"}</span>
                </button>
              ))}
              <Button
                className="w-full"
                variant="outline"
                disabled={!selectedClassId}
                onClick={() => {
                  setSelectedDayId("");
                  setAssetUrls([]);
                  setBlocks([]);
                  dayForm.reset({ title: "", content: "", published: false });
                }}
              >
                <Plus size={16} />
                New day
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Backup / Reuse</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <select
                className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                value={backupTargetClassId}
                onChange={(event) => setBackupTargetClassId(event.target.value)}
              >
                <option value="">Create backup only</option>
                {(classes?.data ?? [])
                  .filter((item) => item.id !== selectedClassId)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      Copy to {classLabel(item)}
                    </option>
                  ))}
              </select>
              <Button className="w-full" variant="outline" disabled={!selectedClassId || backupClass.isPending} onClick={() => backupClass.mutate()}>
                <Copy size={16} />
                Backup class
              </Button>
            </CardContent>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Day Content</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={dayForm.handleSubmit((values) => saveDay.mutate(values))}>
                <div className="grid gap-3 md:grid-cols-[120px_1fr]">
                  <Input type="number" placeholder="Day" {...dayForm.register("dayNumber")} />
                  <Input placeholder="Day title" {...dayForm.register("title")} />
                </div>
                <Textarea placeholder="Text content for this day" {...dayForm.register("content")} />
                <div className="rounded-md border border-border p-3">
                  <div className="mb-3 grid gap-2 md:grid-cols-[150px_1fr_auto]">
                    <select className="h-10 rounded-md border border-border bg-white px-3 text-sm" value={blockType} onChange={(event) => setBlockType(event.target.value)}>
                      <option value="heading">Heading</option>
                      <option value="paragraph">Paragraph</option>
                      <option value="quote">Quote</option>
                      <option value="link">Link</option>
                    </select>
                    <Input placeholder="Add blog-style block text or URL" value={blockText} onChange={(event) => setBlockText(event.target.value)} />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        if (!blockText.trim()) return;
                        setBlocks((current) => [
                          ...current,
                          blockType === "link" ? { type: blockType, url: blockText.trim(), text: blockText.trim() } : { type: blockType, text: blockText.trim() }
                        ]);
                        setBlockText("");
                      }}
                    >
                      <Plus size={16} />
                      Add
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {blocks.map((block, index) => {
                      const Icon = block.type === "heading" ? Type : block.type === "image" ? Image : block.type === "file" ? FileText : block.type === "link" ? Link : FileText;
                      return (
                        <div key={`${block.type}-${index}`} className="flex items-center justify-between gap-3 rounded-md bg-muted p-3 text-sm">
                          <div className="flex min-w-0 items-center gap-2">
                            <Icon size={16} className="shrink-0 text-primary" />
                            <span className="truncate">{block.text ?? block.url}</span>
                          </div>
                          <button type="button" className="text-slate-500 hover:text-red-600" onClick={() => setBlocks((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                            <Trash2 size={16} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-center">
                  <Input type="file" onChange={(event) => setAssetFile(event.target.files?.[0] ?? null)} />
                  <Button type="button" variant="outline" disabled={!assetFile || uploadAsset.isPending} onClick={() => uploadAsset.mutate()}>
                    <FileUp size={16} />
                    Upload
                  </Button>
                </div>
                {assetUrls.length ? (
                  <div className="flex flex-wrap gap-2">
                    {assetUrls.map((url) => (
                      <Badge key={url} tone="info">{url.split("/").pop()}</Badge>
                    ))}
                  </div>
                ) : null}
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" {...dayForm.register("published")} />
                  Published for students
                </label>
                <Button disabled={!selectedClassId || saveDay.isPending}>
                  <Save size={16} />
                  Save day
                </Button>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Assignment For Selected Day</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="grid gap-3 md:grid-cols-2" onSubmit={assignmentForm.handleSubmit((values) => createAssignment.mutate(values))}>
                <Input placeholder="Assignment title" {...assignmentForm.register("title")} />
                <Input type="datetime-local" {...assignmentForm.register("dueDate")} />
                <Input type="number" placeholder="Points" {...assignmentForm.register("points")} />
                <Textarea className="md:col-span-2" placeholder="Description" {...assignmentForm.register("description")} />
                <Button className="md:col-span-2" disabled={!selectedClassId || !selectedDayId || createAssignment.isPending}>
                  <Plus size={16} />
                  Add day assignment
                </Button>
              </form>
              <div className="mt-4 space-y-2">
                {dayAssignments.map((assignment) => (
                  <div key={assignment.id} className="rounded-md bg-muted p-3 text-sm">
                    <p className="font-medium">{assignment.title}</p>
                    <p className="text-xs text-slate-500">{new Date(assignment.dueDate).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Grade Submissions</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="mb-4 grid gap-3 md:grid-cols-[1fr_120px]" onSubmit={gradeForm.handleSubmit((values) => gradeSubmission.mutate(values))}>
                <select className="h-10 rounded-md border border-border bg-white px-3 text-sm" {...gradeForm.register("submissionId")}>
                  <option value="">Select submission</option>
                  {daySubmissions.map((submission) => (
                    <option key={submission.id} value={submission.id}>
                      {submission.studentName} - {submission.assignmentTitle}
                    </option>
                  ))}
                </select>
                <Input type="number" placeholder="Grade" {...gradeForm.register("grade", { valueAsNumber: true })} />
                <Textarea className="md:col-span-2" placeholder="Feedback" {...gradeForm.register("feedback")} />
                <Button className="md:col-span-2" disabled={gradeSubmission.isPending}>
                  <Star size={16} />
                  Save grade
                </Button>
              </form>
              <Table>
                <thead>
                  <tr>
                    <Th>Student</Th>
                    <Th>Assignment</Th>
                    <Th>Grade</Th>
                  </tr>
                </thead>
                <tbody>
                  {daySubmissions.map((submission) => (
                    <tr key={submission.id}>
                      <Td>{submission.studentName}</Td>
                      <Td>{submission.assignmentTitle}</Td>
                      <Td>{submission.grade ?? "Pending"}</Td>
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
