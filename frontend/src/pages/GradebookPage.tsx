import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Award, CheckCircle2, MousePointer2, Palette, Plus, Save, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Input, Textarea } from "../components/ui/Input";
import { SectionHeader } from "../components/ui/SectionHeader";
import { Table, Td, Th } from "../components/ui/Table";
import { useAuth } from "../features/auth/AuthProvider";
import { api } from "../services/api";
import type { Certificate, CertificateElement, CertificateTemplate, ClassRecord, GradebookRow } from "../types";

const fallbackTemplate: CertificateTemplate = {
  name: "Classic Academic Certificate",
  page: { background: "#fbfaf7", borderColor: "#1f2937", accentColor: "#0f766e", paper: "landscape" },
  elements: [
    { id: "title", kind: "title", text: "Certificate of Completion", x: 12, y: 13, width: 76, fontSize: 40, fontFamily: "Georgia, serif", color: "#111827", align: "center", weight: "bold", italic: false },
    { id: "subtitle", kind: "subtitle", text: "This certificate is proudly presented to", x: 18, y: 29, width: 64, fontSize: 16, fontFamily: "Inter, sans-serif", color: "#475569", align: "center", weight: "normal", italic: false },
    { id: "student", kind: "student", x: 14, y: 37, width: 72, fontSize: 34, fontFamily: "Georgia, serif", color: "#0f172a", align: "center", weight: "bold", italic: false },
    { id: "course", kind: "course", text: "for successfully completing {{courseTitle}}", x: 18, y: 51, width: 64, fontSize: 18, fontFamily: "Inter, sans-serif", color: "#334155", align: "center", weight: "normal", italic: false },
    { id: "instructor", kind: "custom", text: "Instructor: {{instructorName}}", x: 18, y: 60, width: 64, fontSize: 15, fontFamily: "Inter, sans-serif", color: "#475569", align: "center", weight: "normal", italic: false },
    { id: "date", kind: "date", text: "Issued {{issuedAt}}", x: 12, y: 74, width: 30, fontSize: 14, fontFamily: "Inter, sans-serif", color: "#334155", align: "left", weight: "normal", italic: false },
    { id: "code", kind: "code", text: "Verification {{verificationCode}}", x: 58, y: 74, width: 30, fontSize: 14, fontFamily: "Inter, sans-serif", color: "#334155", align: "right", weight: "normal", italic: false },
    { id: "signature", kind: "signature", text: "EduCore Admissions", x: 34, y: 79, width: 32, fontSize: 16, fontFamily: "Georgia, serif", color: "#111827", align: "center", weight: "semibold", italic: true }
  ]
};

const colorSwatches = ["#fbfaf7", "#ffffff", "#f8fafc", "#111827", "#0f766e", "#1d4ed8", "#7c2d12", "#b45309"];
const instructorTemplateElement = fallbackTemplate.elements.find((element) => element.id === "instructor")!;

function gradeLabel(value: number | null) {
  return value === null || value === undefined ? "No grades" : `${value}%`;
}

function dateLabel(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

type PreviewData = Partial<Certificate> & {
  studentName?: string;
  courseTitle?: string;
  instructorName?: string;
  issuedAt?: string;
  verificationCode?: string;
  finalGrade?: number | null;
};

function elementText(element: CertificateElement, certificate?: PreviewData | null) {
  const sample = {
    studentName: certificate?.studentName ?? "Student Name",
    courseTitle: certificate?.courseTitle ?? "Course Title",
    instructorName: certificate?.instructorName ?? "Instructor Name",
    issuedAt: certificate?.issuedAt ? dateLabel(certificate.issuedAt) : dateLabel(new Date().toISOString()),
    verificationCode: certificate?.verificationCode ?? "EDU-1234ABCD",
    finalGrade: gradeLabel(certificate?.finalGrade ?? 92)
  };

  if (element.kind === "student") return sample.studentName;
  if (element.kind === "course" && !element.text?.includes("{{")) return `for successfully completing ${sample.courseTitle}`;
  if (element.kind === "date" && !element.text?.includes("{{")) return `Issued ${sample.issuedAt}`;
  if (element.kind === "code" && !element.text?.includes("{{")) return `Verification ${sample.verificationCode}`;
  if (element.kind === "grade" && !element.text?.includes("{{")) return sample.finalGrade;

  const base =
    element.text ??
    (element.kind === "course"
        ? "{{courseTitle}}"
        : element.kind === "date"
          ? "{{issuedAt}}"
          : element.kind === "code"
            ? "{{verificationCode}}"
            : element.kind === "grade"
              ? "{{finalGrade}}"
              : "");

  return base
    .replaceAll("{{studentName}}", sample.studentName)
    .replaceAll("{{courseTitle}}", sample.courseTitle)
    .replaceAll("{{instructorName}}", sample.instructorName)
    .replaceAll("{{issuedAt}}", sample.issuedAt)
    .replaceAll("{{verificationCode}}", sample.verificationCode)
    .replaceAll("{{finalGrade}}", sample.finalGrade);
}

function cloneTemplate(template?: CertificateTemplate): CertificateTemplate {
  const clone = JSON.parse(JSON.stringify(template ?? fallbackTemplate)) as CertificateTemplate;
  const elements = Array.isArray(clone.elements) ? clone.elements : [];
  const hasInstructorElement = elements.some((element) => element.id === "instructor" || element.text?.includes("{{instructorName}}"));

  return {
    ...clone,
    elements: hasInstructorElement ? elements : [...elements, { ...instructorTemplateElement }]
  };
}

function weightClass(weight: CertificateElement["weight"]) {
  if (weight === "bold") return 700;
  if (weight === "semibold") return 600;
  return 400;
}

function CertificateCanvas({
  template,
  selectedId,
  certificate,
  editable,
  large,
  onSelect,
  onMove
}: {
  template: CertificateTemplate;
  selectedId?: string;
  certificate?: PreviewData | null;
  editable?: boolean;
  large?: boolean;
  onSelect?: (id: string) => void;
  onMove?: (id: string, x: number, y: number) => void;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);

  return (
    <div
      className={`relative mx-auto w-full overflow-hidden rounded-md border bg-white shadow-soft print:max-w-none print:shadow-none ${
        large ? "max-w-[1120px]" : "max-w-[760px]"
      }`}
      style={{
        aspectRatio: template.page.paper === "portrait" ? "1 / 1.414" : "1.414 / 1",
        background: template.page.background,
        borderColor: template.page.borderColor
      }}
      onPointerMove={(event) => {
        if (!editable || !draggingId || !onMove) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const x = Math.max(0, Math.min(95, ((event.clientX - rect.left) / rect.width) * 100));
        const y = Math.max(0, Math.min(92, ((event.clientY - rect.top) / rect.height) * 100));
        onMove(draggingId, x, y);
      }}
      onPointerUp={() => setDraggingId(null)}
      onPointerLeave={() => setDraggingId(null)}
    >
      <div className="absolute inset-[3.5%] rounded-sm border-2" style={{ borderColor: template.page.borderColor }} />
      <div className="absolute inset-[6%] rounded-sm border" style={{ borderColor: template.page.accentColor }} />
      <div className="absolute left-[8%] right-[8%] top-[21%] h-px" style={{ background: template.page.accentColor }} />
      <div className="absolute bottom-[16%] left-[36%] right-[36%] h-px" style={{ background: template.page.borderColor }} />
      {template.elements.map((element) => (
        <button
          key={element.id}
          type="button"
          className={`absolute min-h-6 rounded-sm px-1 text-left outline-none ${editable ? "cursor-move hover:ring-1 hover:ring-primary" : "cursor-default"} ${
            selectedId === element.id ? "ring-2 ring-primary" : ""
          }`}
          style={{
            left: `${element.x}%`,
            top: `${element.y}%`,
            width: `${element.width}%`,
            color: element.color,
            fontSize: `${element.fontSize}px`,
            fontFamily: element.fontFamily,
            textAlign: element.align,
            fontWeight: weightClass(element.weight),
            fontStyle: element.italic ? "italic" : "normal",
            lineHeight: 1.15
          }}
          onPointerDown={(event) => {
            if (!editable) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            setDraggingId(element.id);
            onSelect?.(element.id);
          }}
          onClick={() => onSelect?.(element.id)}
        >
          {elementText(element, certificate)}
        </button>
      ))}
    </div>
  );
}

export function GradebookPage() {
  const { user } = useAuth();
  const [classId, setClassId] = useState("");
  const [search, setSearch] = useState("");
  const [actionError, setActionError] = useState("");
  const [selectedElementId, setSelectedElementId] = useState("title");
  const [draftTemplate, setDraftTemplate] = useState<CertificateTemplate>(fallbackTemplate);
  const [previewCertificateId, setPreviewCertificateId] = useState("");
  const [selectedGradebookKey, setSelectedGradebookKey] = useState("");
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
  const { data: savedTemplate } = useQuery({
    queryKey: ["certificate-template"],
    queryFn: () => api.get<CertificateTemplate>("/gradebook/certificate-template")
  });

  useEffect(() => {
    if (savedTemplate) setDraftTemplate(cloneTemplate(savedTemplate));
  }, [savedTemplate]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const source = gradebook?.data ?? [];
    if (!term) return source;
    return source.filter((row) => [row.studentName, row.email, row.courseTitle, row.room].some((value) => value.toLowerCase().includes(term)));
  }, [gradebook?.data, search]);

  const selectedElement = draftTemplate.elements.find((element) => element.id === selectedElementId) ?? draftTemplate.elements[0];
  const selectedCertificate = (certificates?.data ?? []).find((certificate) => certificate._id === previewCertificateId) ?? null;
  const selectedGradebookRow = previewCertificateId
    ? null
    : rows.find((row) => `${row.studentId}:${row.classId}` === selectedGradebookKey) ?? rows[0] ?? null;
  const rowCertificate = selectedGradebookRow
    ? (certificates?.data ?? []).find((certificate) => certificate.studentId === selectedGradebookRow.studentId && certificate.classId === selectedGradebookRow.classId)
    : null;
  const previewData: PreviewData | null =
    selectedCertificate ??
    rowCertificate ??
    (selectedGradebookRow
      ? {
          studentName: selectedGradebookRow.studentName,
          courseTitle: selectedGradebookRow.courseTitle,
          instructorName: selectedGradebookRow.instructorName,
          finalGrade: selectedGradebookRow.averageGrade,
          issuedAt: new Date().toISOString(),
          verificationCode: "Pending issue"
        }
      : null);
  const previewTemplate = cloneTemplate(selectedCertificate?.templateSnapshot ?? rowCertificate?.templateSnapshot ?? draftTemplate);
  const selectedRowHasCertificate = Boolean(rowCertificate?.status === "issued");
  const canIssueSelectedCertificate = Boolean(
    user?.role !== "student" && selectedGradebookRow && selectedGradebookRow.certificateEligible && !selectedRowHasCertificate
  );
  const issueSelectedHelp = !selectedGradebookRow
    ? "Select a student first"
    : selectedRowHasCertificate
      ? "Certificate already issued"
      : !selectedGradebookRow.certificateEligible
        ? "Complete grading before issuing"
        : "Store this certificate and mark it issued";

  function updateTemplate(updater: (current: CertificateTemplate) => CertificateTemplate) {
    setDraftTemplate((current) => updater(cloneTemplate(current)));
  }

  function updateElement(id: string, patch: Partial<CertificateElement>) {
    updateTemplate((current) => ({
      ...current,
      elements: current.elements.map((element) => (element.id === id ? { ...element, ...patch } : element))
    }));
  }

  const issueCertificate = useMutation({
    mutationFn: (row: GradebookRow) => api.post<Certificate>("/gradebook/certificates", { studentId: row.studentId, classId: row.classId }),
    onMutate: () => setActionError(""),
    onSuccess: (certificate) => {
      queryClient.setQueryData<{ data: Certificate[] }>(["certificates"], (current) => {
        const data = current?.data ?? [];
        const nextData = data.some((item) => item._id === certificate._id)
          ? data.map((item) => (item._id === certificate._id ? certificate : item))
          : [certificate, ...data];

        return { data: nextData };
      });
      setPreviewCertificateId(certificate._id);
      setSelectedGradebookKey("");
      queryClient.invalidateQueries({ queryKey: ["certificates"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => setActionError(error instanceof Error ? error.message : "Certificate could not be issued")
  });

  const saveTemplate = useMutation({
    mutationFn: () => api.put<CertificateTemplate>("/gradebook/certificate-template", draftTemplate),
    onMutate: () => setActionError(""),
    onSuccess: (template) => {
      setDraftTemplate(cloneTemplate(template));
      queryClient.invalidateQueries({ queryKey: ["certificate-template"] });
    },
    onError: (error) => setActionError(error instanceof Error ? error.message : "Certificate template could not be saved")
  });

  const certificateKeys = useMemo(
    () => new Set((certificates?.data ?? []).filter((item) => item.status === "issued").map((item) => `${item.studentId}:${item.classId}`)),
    [certificates?.data]
  );

  return (
    <>
      <SectionHeader
        title="Gradebook"
        description={user?.role === "student" ? "Your grades and issued certificates." : "Class grades, completion status, certificates, and template design."}
      />
      <div className="grid gap-6">
        <div className="space-y-6">
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
                    const rowKey = `${row.studentId}:${row.classId}`;
                    const hasCertificate = certificateKeys.has(rowKey);
                    return (
                      <tr
                        key={`${row.studentId}-${row.classId}`}
                        className={selectedGradebookKey === rowKey ? "bg-teal-50/40" : "cursor-pointer hover:bg-slate-50"}
                        onClick={() => {
                          setSelectedGradebookKey(rowKey);
                          setPreviewCertificateId("");
                        }}
                      >
                        <Td>
                          <div className="font-medium">{row.studentName}</div>
                          <div className="text-xs text-slate-500">{row.email}</div>
                        </Td>
                        <Td>
                          <div className="font-medium">{row.courseTitle}</div>
                          <div className="text-xs text-slate-500">{row.room}</div>
                          <div className="text-xs text-slate-500">{row.instructorName}</div>
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
                              <Button
                                type="button"
                                size="sm"
                                disabled={issueCertificate.isPending}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelectedGradebookKey(rowKey);
                                  setPreviewCertificateId("");
                                  issueCertificate.mutate(row);
                                }}
                              >
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

          {user?.role === "admin" ? (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle>Certificate Designer</CardTitle>
                  <Button size="sm" disabled={saveTemplate.isPending} onClick={() => saveTemplate.mutate()}>
                    <Save size={14} />
                    Save
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_320px]">
                  <CertificateCanvas
                    template={draftTemplate}
                    certificate={previewData}
                    selectedId={selectedElementId}
                    editable
                    large
                    onSelect={setSelectedElementId}
                    onMove={(id, x, y) => updateElement(id, { x, y })}
                  />
                  <div className="space-y-4">
                    <div>
                      <label className="mb-1 block text-sm font-medium">Template name</label>
                      <Input value={draftTemplate.name} onChange={(event) => updateTemplate((current) => ({ ...current, name: event.target.value }))} />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {(["background", "borderColor", "accentColor"] as const).map((field) => (
                        <label key={field} className="text-xs font-medium text-slate-600">
                          {field === "borderColor" ? "Border" : field === "accentColor" ? "Accent" : "Paper"}
                          <Input
                            className="mt-1 h-9 p-1"
                            type="color"
                            value={draftTemplate.page[field]}
                            onChange={(event) => updateTemplate((current) => ({ ...current, page: { ...current.page, [field]: event.target.value } }))}
                          />
                        </label>
                      ))}
                    </div>
                    <div>
                      <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
                        <MousePointer2 size={15} />
                        Selected element
                      </p>
                      <select className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm" value={selectedElementId} onChange={(event) => setSelectedElementId(event.target.value)}>
                        {draftTemplate.elements.map((element) => (
                          <option key={element.id} value={element.id}>
                            {element.label ?? element.kind}
                          </option>
                        ))}
                      </select>
                    </div>
                    {selectedElement ? (
                      <div className="space-y-3 rounded-md border border-border p-3">
                          <Textarea
                            rows={3}
                            value={selectedElement.text ?? ""}
                          placeholder="Use {{studentName}}, {{courseTitle}}, {{instructorName}}, {{issuedAt}}, {{verificationCode}}, {{finalGrade}}"
                            onChange={(event) => updateElement(selectedElement.id, { text: event.target.value })}
                          />
                        <div className="grid grid-cols-2 gap-2">
                          <Input type="number" value={selectedElement.fontSize} onChange={(event) => updateElement(selectedElement.id, { fontSize: Number(event.target.value) })} />
                          <Input type="color" className="p-1" value={selectedElement.color} onChange={(event) => updateElement(selectedElement.id, { color: event.target.value })} />
                          <Input type="number" value={Math.round(selectedElement.x)} onChange={(event) => updateElement(selectedElement.id, { x: Number(event.target.value) })} />
                          <Input type="number" value={Math.round(selectedElement.y)} onChange={(event) => updateElement(selectedElement.id, { y: Number(event.target.value) })} />
                          <Input type="number" value={Math.round(selectedElement.width)} onChange={(event) => updateElement(selectedElement.id, { width: Number(event.target.value) })} />
                          <select className="h-10 rounded-md border border-border bg-white px-3 text-sm" value={selectedElement.align} onChange={(event) => updateElement(selectedElement.id, { align: event.target.value as CertificateElement["align"] })}>
                            <option value="left">Left</option>
                            <option value="center">Center</option>
                            <option value="right">Right</option>
                          </select>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {colorSwatches.map((color) => (
                            <button key={color} type="button" className="h-7 w-7 rounded-md border border-border" style={{ background: color }} title={color} onClick={() => updateElement(selectedElement.id, { color })} />
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        const id = `custom-${Date.now()}`;
                        updateTemplate((current) => ({
                          ...current,
                          elements: [
                            ...current.elements,
                            { id, kind: "custom", text: "Custom text", x: 20, y: 60, width: 60, fontSize: 18, fontFamily: "Inter, sans-serif", color: "#111827", align: "center", weight: "normal", italic: false }
                          ]
                        }));
                        setSelectedElementId(id);
                      }}
                    >
                      <Plus size={16} />
                      Add text
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <Card>
            <CardHeader>
              <CardTitle>Certificate Preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <select
                className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
                value={previewCertificateId}
                onChange={(event) => {
                  setPreviewCertificateId(event.target.value);
                  if (event.target.value) setSelectedGradebookKey("");
                }}
              >
                <option value="">Use selected student</option>
                {(certificates?.data ?? []).map((certificate) => (
                  <option key={certificate._id} value={certificate._id}>
                    {certificate.studentName} / {certificate.courseTitle}
                  </option>
                ))}
              </select>
              {previewData ? (
                <div className="rounded-md bg-muted p-3 text-sm">
                  <div className="font-medium">{previewData.studentName}</div>
                  <div className="text-slate-600">{previewData.courseTitle}</div>
                  <div className="text-slate-500">Instructor: {previewData.instructorName ?? "Not assigned"}</div>
                </div>
              ) : null}
              <CertificateCanvas template={previewTemplate} certificate={previewData} />
              <div className="grid gap-2 sm:grid-cols-2">
                <Button type="button" className="w-full" variant="outline" onClick={() => window.print()}>
                  <Palette size={16} />
                  Print preview
                </Button>
                {user?.role !== "student" ? (
                  <Button
                    type="button"
                    className="w-full"
                    disabled={!canIssueSelectedCertificate || issueCertificate.isPending}
                    title={issueSelectedHelp}
                    onClick={() => {
                      if (selectedGradebookRow) issueCertificate.mutate(selectedGradebookRow);
                    }}
                  >
                    <CheckCircle2 size={16} />
                    Save & issue
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Certificates</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {(certificates?.data ?? []).map((certificate) => (
                  <button
                    key={certificate._id}
                    type="button"
                    className="w-full rounded-md border border-border p-4 text-left hover:border-primary"
                    onClick={() => {
                      setPreviewCertificateId(certificate._id);
                      setSelectedGradebookKey("");
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{certificate.courseTitle}</p>
                        <p className="mt-1 text-sm text-slate-600">{certificate.studentName}</p>
                      </div>
                      <Badge tone={certificate.status === "issued" ? "success" : "danger"}>{certificate.status}</Badge>
                    </div>
                    <div className="mt-3 grid gap-1 text-sm text-slate-600">
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
                      <div className="flex items-center justify-between">
                        <span>Instructor</span>
                        <span>{certificate.instructorName ?? "Not assigned"}</span>
                      </div>
                    </div>
                  </button>
                ))}
                {(certificates?.data ?? []).length === 0 ? <p className="text-sm text-slate-500">No certificates issued yet.</p> : null}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
