import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Bell, CheckCircle, ClipboardList, LifeBuoy, MessageSquare, Save, Search, ShieldAlert } from "lucide-react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Input, Textarea } from "../components/ui/Input";
import { SectionHeader } from "../components/ui/SectionHeader";
import { Table, Td, Th } from "../components/ui/Table";
import { api } from "../services/api";

type RiskLevel = "critical" | "high" | "watch" | "stable";
type InterventionAction = "warning" | "meeting" | "support_plan" | "parent_contact" | "note";

interface Intervention {
  _id: string;
  action: string;
  entityId: string;
  metadata?: {
    note?: string;
    action?: InterventionAction;
    authorName?: string;
    notifyStudent?: boolean;
  };
  createdAt: string;
}

interface SuccessStudent {
  studentId: string;
  userId: string;
  fullName: string;
  email: string;
  studentCode: string;
  department: string;
  semester: number;
  status: string;
  classNames: string;
  attendanceRate: number;
  absences: number;
  averageGrade: number | null;
  missingSubmissions: number;
  lateSubmissions: number;
  riskScore: number;
  riskLevel: RiskLevel;
  reasons: string[];
  interventions: Intervention[];
  interventionCount: number;
  lastInterventionAt?: string | null;
}

const riskTone: Record<RiskLevel, "danger" | "warning" | "info" | "success"> = {
  critical: "danger",
  high: "warning",
  watch: "info",
  stable: "success"
};

const actionLabel: Record<InterventionAction, string> = {
  warning: "Warning",
  meeting: "Meeting",
  support_plan: "Support plan",
  parent_contact: "Parent contact",
  note: "Note"
};

export function SuccessCenterPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<RiskLevel | "all">("all");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [action, setAction] = useState<InterventionAction>("warning");
  const [note, setNote] = useState("");
  const [notifyStudent, setNotifyStudent] = useState(true);

  const { data } = useQuery({
    queryKey: ["success-center"],
    queryFn: () => api.get<{ data: SuccessStudent[] }>("/reports/success-center")
  });

  const students = data?.data ?? [];
  const filteredStudents = useMemo(() => {
    const term = search.trim().toLowerCase();
    return students.filter((student) => {
      const matchesRisk = riskFilter === "all" || student.riskLevel === riskFilter;
      const matchesSearch =
        !term ||
        student.fullName.toLowerCase().includes(term) ||
        student.email.toLowerCase().includes(term) ||
        student.studentCode.toLowerCase().includes(term) ||
        student.classNames.toLowerCase().includes(term);
      return matchesRisk && matchesSearch;
    });
  }, [riskFilter, search, students]);

  const selectedStudent = useMemo(
    () => students.find((student) => student.studentId === selectedStudentId) ?? filteredStudents[0],
    [filteredStudents, selectedStudentId, students]
  );

  const totals = useMemo(
    () => ({
      tracked: students.length,
      critical: students.filter((student) => student.riskLevel === "critical").length,
      high: students.filter((student) => student.riskLevel === "high").length,
      watch: students.filter((student) => student.riskLevel === "watch").length
    }),
    [students]
  );

  const createIntervention = useMutation({
    mutationFn: () =>
      api.post(`/reports/success-center/${selectedStudent?.studentId}/interventions`, {
        action,
        note,
        notifyStudent
      }),
    onSuccess: () => {
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["success-center"] });
    }
  });

  return (
    <>
      <SectionHeader title="Student Success" description="Risk detection, intervention tracking, and student support workflow." />

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Tracked Students</p>
              <p className="mt-1 text-2xl font-semibold">{totals.tracked}</p>
            </div>
            <LifeBuoy className="text-primary" size={22} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Critical</p>
              <p className="mt-1 text-2xl font-semibold">{totals.critical}</p>
            </div>
            <ShieldAlert className="text-red-600" size={22} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">High Risk</p>
              <p className="mt-1 text-2xl font-semibold">{totals.high}</p>
            </div>
            <AlertTriangle className="text-amber-600" size={22} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Watch List</p>
              <p className="mt-1 text-2xl font-semibold">{totals.watch}</p>
            </div>
            <ClipboardList className="text-primary" size={22} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[430px_1fr]">
        <Card>
          <CardHeader>
            <div className="space-y-3">
              <CardTitle>Students</CardTitle>
              <div className="grid gap-2 md:grid-cols-[1fr_150px]">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                  <Input className="pl-9" placeholder="Search students" value={search} onChange={(event) => setSearch(event.target.value)} />
                </div>
                <select
                  className="h-10 rounded-md border border-border bg-white px-3 text-sm"
                  value={riskFilter}
                  onChange={(event) => setRiskFilter(event.target.value as RiskLevel | "all")}
                >
                  <option value="all">All risks</option>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="watch">Watch</option>
                  <option value="stable">Stable</option>
                </select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {filteredStudents.map((student) => (
              <button
                key={student.studentId}
                type="button"
                className={`w-full rounded-md border px-3 py-3 text-left text-sm ${
                  selectedStudent?.studentId === student.studentId ? "border-primary bg-teal-50" : "border-border bg-white hover:bg-muted"
                }`}
                onClick={() => setSelectedStudentId(student.studentId)}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="font-medium">{student.fullName}</span>
                  <Badge tone={riskTone[student.riskLevel]}>{student.riskLevel}</Badge>
                </span>
                <span className="mt-1 block text-xs text-slate-500">{student.studentCode} / {student.department}</span>
                <span className="mt-2 flex flex-wrap gap-2">
                  <Badge tone={student.attendanceRate < 70 ? "danger" : "neutral"}>{student.attendanceRate}% attendance</Badge>
                  <Badge tone={student.missingSubmissions > 0 ? "warning" : "success"}>{student.missingSubmissions} missing</Badge>
                </span>
              </button>
            ))}
            {filteredStudents.length === 0 ? <p className="text-sm text-slate-500">No students match the current filters.</p> : null}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle>{selectedStudent?.fullName ?? "Student Detail"}</CardTitle>
                {selectedStudent ? <Badge tone={riskTone[selectedStudent.riskLevel]}>{selectedStudent.riskLevel} / {selectedStudent.riskScore}</Badge> : null}
              </div>
            </CardHeader>
            <CardContent>
              {selectedStudent ? (
                <div className="space-y-5">
                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="rounded-md bg-muted p-3">
                      <p className="text-xs font-semibold uppercase text-slate-500">Attendance</p>
                      <p className="mt-1 text-2xl font-semibold">{selectedStudent.attendanceRate}%</p>
                    </div>
                    <div className="rounded-md bg-muted p-3">
                      <p className="text-xs font-semibold uppercase text-slate-500">Avg Grade</p>
                      <p className="mt-1 text-2xl font-semibold">{selectedStudent.averageGrade ?? "-"}</p>
                    </div>
                    <div className="rounded-md bg-muted p-3">
                      <p className="text-xs font-semibold uppercase text-slate-500">Missing</p>
                      <p className="mt-1 text-2xl font-semibold">{selectedStudent.missingSubmissions}</p>
                    </div>
                    <div className="rounded-md bg-muted p-3">
                      <p className="text-xs font-semibold uppercase text-slate-500">Late</p>
                      <p className="mt-1 text-2xl font-semibold">{selectedStudent.lateSubmissions}</p>
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-sm font-medium">Risk reasons</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedStudent.reasons.length ? (
                        selectedStudent.reasons.map((reason) => <Badge key={reason} tone="warning">{reason}</Badge>)
                      ) : (
                        <Badge tone="success">stable</Badge>
                      )}
                    </div>
                  </div>

                  <Table>
                    <tbody>
                      <tr>
                        <Th>Email</Th>
                        <Td>{selectedStudent.email}</Td>
                      </tr>
                      <tr>
                        <Th>Classes</Th>
                        <Td>{selectedStudent.classNames || "No active class"}</Td>
                      </tr>
                      <tr>
                        <Th>Interventions</Th>
                        <Td>{selectedStudent.interventionCount}</Td>
                      </tr>
                    </tbody>
                  </Table>
                </div>
              ) : (
                <p className="text-sm text-slate-500">Select a student to open the success plan.</p>
              )}
            </CardContent>
          </Card>

          {selectedStudent ? (
            <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
              <Card>
                <CardHeader>
                  <CardTitle>Intervention Timeline</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {selectedStudent.interventions.map((item) => (
                    <div key={item._id} className="rounded-md border border-border p-3">
                      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <MessageSquare size={14} />
                        <span className="font-medium text-slate-700">{actionLabel[item.metadata?.action ?? "note"] ?? item.action}</span>
                        {item.metadata?.notifyStudent ? <Badge tone="info">student notified</Badge> : null}
                        <span>{new Date(item.createdAt).toLocaleString()}</span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{item.metadata?.note ?? "No note recorded."}</p>
                      {item.metadata?.authorName ? <p className="mt-2 text-xs text-slate-500">By {item.metadata.authorName}</p> : null}
                    </div>
                  ))}
                  {selectedStudent.interventions.length === 0 ? <p className="text-sm text-slate-500">No interventions recorded yet.</p> : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>New Intervention</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <select className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm" value={action} onChange={(event) => setAction(event.target.value as InterventionAction)}>
                    <option value="warning">Warning</option>
                    <option value="meeting">Meeting</option>
                    <option value="support_plan">Support plan</option>
                    <option value="parent_contact">Parent contact</option>
                    <option value="note">Note</option>
                  </select>
                  <Textarea placeholder="Document the action or support plan" value={note} onChange={(event) => setNote(event.target.value)} />
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={notifyStudent} onChange={(event) => setNotifyStudent(event.target.checked)} />
                    Notify student
                  </label>
                  <Button className="w-full" disabled={!note.trim() || createIntervention.isPending} onClick={() => createIntervention.mutate()}>
                    {notifyStudent ? <Bell size={16} /> : <Save size={16} />}
                    Save intervention
                  </Button>
                  {createIntervention.isSuccess ? (
                    <div className="flex items-center gap-2 rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">
                      <CheckCircle size={16} />
                      Intervention saved
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
