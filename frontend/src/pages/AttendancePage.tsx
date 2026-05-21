import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Save, Users } from "lucide-react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { SectionHeader } from "../components/ui/SectionHeader";
import { Table, Td, Th } from "../components/ui/Table";
import { useAuth } from "../features/auth/AuthProvider";
import { api } from "../services/api";
import type { AttendanceRecord, ClassDay, ClassRecord, Student } from "../types";

type AttendanceStatus = "present" | "absent" | "late" | "excused";

interface MarkState {
  status: AttendanceStatus;
  notes: string;
}

interface AttendanceSession {
  dayId: string;
  dayNumber: number | null;
  dayTitle: string;
  date: string;
  startedAt: string;
  totalMarked: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
}

interface AttendanceHealthClass {
  classId: string;
  courseTitle: string;
  room: string;
  instructorName: string;
  totalStudents: number;
  totalSessions: number;
  lastStartedAt?: string | null;
  lastPresent: number;
  sessions: AttendanceSession[];
}

const statusOptions: AttendanceStatus[] = ["present", "absent", "late", "excused"];

function editable(record?: AttendanceRecord) {
  if (!record) return true;
  return record.isEditable === true || record.isEditable === 1;
}

function statusTone(status: AttendanceStatus) {
  if (status === "present") return "success";
  if (status === "absent") return "danger";
  if (status === "late") return "warning";
  return "neutral";
}

function classLabel(item: Pick<ClassRecord, "courseTitle" | "room">) {
  return `${item.courseTitle} / ${item.room}`;
}

function formatTime(value?: string | null) {
  return value ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-";
}

export function AttendancePage() {
  const { user } = useAuth();
  return user?.role === "admin" ? <AdminAttendanceHealth /> : <InstructorAttendanceWorkflow />;
}

function AdminAttendanceHealth() {
  const [selectedClassId, setSelectedClassId] = useState("");
  const { data } = useQuery({
    queryKey: ["attendance-health"],
    queryFn: () => api.get<{ data: AttendanceHealthClass[] }>("/attendance/health")
  });
  const selectedClass = useMemo(
    () => (data?.data ?? []).find((item) => item.classId === selectedClassId),
    [data?.data, selectedClassId]
  );

  useEffect(() => {
    if (!selectedClassId && data?.data?.[0]) setSelectedClassId(data.data[0].classId);
  }, [data?.data, selectedClassId]);

  return (
    <>
      <SectionHeader title="Attendance" description="Class attendance start time, marked students, and present counts." />
      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Classes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(data?.data ?? []).map((item) => (
              <button
                key={item.classId}
                type="button"
                className={`w-full rounded-md border px-3 py-3 text-left text-sm ${selectedClassId === item.classId ? "border-primary bg-teal-50" : "border-border bg-white hover:bg-muted"}`}
                onClick={() => setSelectedClassId(item.classId)}
              >
                <span className="block font-medium">{classLabel(item)}</span>
                <span className="mt-1 block text-xs text-slate-500">{item.instructorName}</span>
                <span className="mt-2 flex flex-wrap gap-2">
                  <Badge tone="info">{item.totalSessions} sessions</Badge>
                  <Badge tone="success">{item.lastPresent} present last time</Badge>
                </span>
              </button>
            ))}
            {(data?.data ?? []).length === 0 ? <p className="text-sm text-slate-500">No attendance records yet.</p> : null}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{selectedClass ? classLabel(selectedClass) : "Class Attendance"}</CardTitle>
            </CardHeader>
            <CardContent>
              {selectedClass ? (
                <div className="space-y-5">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-md bg-muted p-3">
                      <p className="text-xs font-semibold uppercase text-slate-500">Last Started</p>
                      <p className="mt-1 text-2xl font-semibold">{formatTime(selectedClass.lastStartedAt)}</p>
                    </div>
                    <div className="rounded-md bg-muted p-3">
                      <p className="text-xs font-semibold uppercase text-slate-500">Class Size</p>
                      <p className="mt-1 text-2xl font-semibold">{selectedClass.totalStudents}</p>
                    </div>
                    <div className="rounded-md bg-muted p-3">
                      <p className="text-xs font-semibold uppercase text-slate-500">Present Last Session</p>
                      <p className="mt-1 text-2xl font-semibold">{selectedClass.lastPresent}</p>
                    </div>
                  </div>
                  <Table>
                    <thead>
                      <tr>
                        <Th>Day</Th>
                        <Th>Date</Th>
                        <Th>Started</Th>
                        <Th>Marked</Th>
                        <Th>Present</Th>
                        <Th>Absent</Th>
                        <Th>Late</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedClass.sessions.map((session) => (
                        <tr key={`${session.dayId}-${session.date}`}>
                          <Td>
                            <div className="font-medium">
                              {session.dayNumber ? `Day ${session.dayNumber}: ` : ""}
                              {session.dayTitle}
                            </div>
                          </Td>
                          <Td>{session.date}</Td>
                          <Td>{formatTime(session.startedAt)}</Td>
                          <Td>{session.totalMarked}</Td>
                          <Td>
                            <Badge tone="success">{session.present}</Badge>
                          </Td>
                          <Td>
                            <Badge tone={session.absent > 0 ? "danger" : "neutral"}>{session.absent}</Badge>
                          </Td>
                          <Td>{session.late}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                  {selectedClass.sessions.length === 0 ? <p className="text-sm text-slate-500">This class has no saved attendance sessions yet.</p> : null}
                </div>
              ) : (
                <p className="text-sm text-slate-500">Select a class to inspect attendance timing and counts.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function InstructorAttendanceWorkflow() {
  const queryClient = useQueryClient();
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedDayId, setSelectedDayId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [marks, setMarks] = useState<Record<string, MarkState>>({});

  const { data: classes } = useQuery({
    queryKey: ["classes"],
    queryFn: () => api.get<{ data: ClassRecord[] }>("/courses/classes/all")
  });
  const { data: days } = useQuery({
    queryKey: ["class-days", selectedClassId],
    queryFn: () => api.get<{ data: ClassDay[] }>(`/courses/classes/${selectedClassId}/days`),
    enabled: Boolean(selectedClassId)
  });
  const { data: classStudents } = useQuery({
    queryKey: ["class-students", selectedClassId],
    queryFn: () => api.get<{ data: Student[] }>(`/courses/classes/${selectedClassId}/students`),
    enabled: Boolean(selectedClassId)
  });
  const { data: attendance } = useQuery({
    queryKey: ["attendance"],
    queryFn: () => api.get<{ data: AttendanceRecord[] }>("/attendance")
  });

  const selectedClass = useMemo(() => (classes?.data ?? []).find((item) => item.id === selectedClassId), [classes?.data, selectedClassId]);
  const selectedDay = useMemo(() => (days?.data ?? []).find((day) => day._id === selectedDayId), [days?.data, selectedDayId]);

  const existingByStudent = useMemo(() => {
    const result: Record<string, AttendanceRecord> = {};
    for (const record of attendance?.data ?? []) {
      if (record.classId === selectedClassId && record.dayId === selectedDayId) {
        result[record.studentId] = record;
      }
    }
    return result;
  }, [attendance?.data, selectedClassId, selectedDayId]);

  useEffect(() => {
    const next: Record<string, MarkState> = {};
    for (const student of classStudents?.data ?? []) {
      const existing = existingByStudent[student.id];
      next[student.id] = {
        status: existing?.status ?? "present",
        notes: existing?.notes ?? ""
      };
    }
    setMarks(next);
  }, [classStudents?.data, existingByStudent]);

  const markTotals = useMemo(
    () =>
      Object.values(marks).reduce<Record<AttendanceStatus, number>>(
        (totals, mark) => ({ ...totals, [mark.status]: totals[mark.status] + 1 }),
        { present: 0, absent: 0, late: 0, excused: 0 }
      ),
    [marks]
  );

  const bulkSave = useMutation({
    mutationFn: () =>
      api.post("/attendance/bulk", {
        classId: selectedClassId,
        dayId: selectedDayId,
        date,
        records: Object.entries(marks).map(([studentId, value]) => ({
          studentId,
          status: value.status,
          notes: value.notes
        }))
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      queryClient.invalidateQueries({ queryKey: ["attendance-health"] });
    }
  });

  return (
    <>
      <SectionHeader title="Attendance" description="Select a class day, mark the roster, and save within the attendance window." />
      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Class</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(classes?.data ?? []).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`w-full rounded-md border px-3 py-2 text-left text-sm ${selectedClassId === item.id ? "border-primary bg-teal-50" : "border-border bg-white hover:bg-muted"}`}
                  onClick={() => {
                    setSelectedClassId(item.id);
                    setSelectedDayId("");
                  }}
                >
                  <span className="block font-medium">{classLabel(item)}</span>
                  {item.instructorName ? <span className="mt-1 block text-xs text-slate-500">{item.instructorName}</span> : null}
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Day</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {(days?.data ?? []).map((day) => (
                  <button
                    key={day._id}
                    type="button"
                    className={`w-full rounded-md border px-3 py-2 text-left text-sm ${selectedDayId === day._id ? "border-primary bg-teal-50" : "border-border bg-white hover:bg-muted"}`}
                    onClick={() => setSelectedDayId(day._id)}
                  >
                    <span className="font-medium">Day {day.dayNumber}: {day.title}</span>
                    <span className="mt-1 block text-xs text-slate-500">{day.published ? "Published" : "Draft"}</span>
                  </button>
                ))}
                {selectedClassId && (days?.data ?? []).length === 0 ? <p className="text-sm text-slate-500">No days are available for this class.</p> : null}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle>{selectedClass ? classLabel(selectedClass) : "Roster"}</CardTitle>
                <Button disabled={!selectedClassId || !selectedDayId || bulkSave.isPending} onClick={() => bulkSave.mutate()}>
                  <Save size={16} />
                  Save attendance
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-md bg-emerald-50 p-3 text-emerald-800">
                  <p className="text-xs font-semibold uppercase">Present</p>
                  <p className="mt-1 text-2xl font-semibold">{markTotals.present}</p>
                </div>
                <div className="rounded-md bg-red-50 p-3 text-red-700">
                  <p className="text-xs font-semibold uppercase">Absent</p>
                  <p className="mt-1 text-2xl font-semibold">{markTotals.absent}</p>
                </div>
                <div className="rounded-md bg-amber-50 p-3 text-amber-800">
                  <p className="text-xs font-semibold uppercase">Late</p>
                  <p className="mt-1 text-2xl font-semibold">{markTotals.late}</p>
                </div>
                <div className="rounded-md bg-slate-100 p-3 text-slate-700">
                  <p className="text-xs font-semibold uppercase">Excused</p>
                  <p className="mt-1 text-2xl font-semibold">{markTotals.excused}</p>
                </div>
              </div>

              {selectedDay ? (
                <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                  <CalendarClock size={16} />
                  <span>Day {selectedDay.dayNumber}: {selectedDay.title}</span>
                  <Users size={16} />
                  <span>{(classStudents?.data ?? []).length} students</span>
                </div>
              ) : null}

              <Table>
                <thead>
                  <tr>
                    <Th>Student</Th>
                    <Th>Status</Th>
                    <Th>Notes</Th>
                    <Th>Window</Th>
                  </tr>
                </thead>
                <tbody>
                  {(classStudents?.data ?? []).map((student) => {
                    const record = existingByStudent[student.id];
                    const locked = !editable(record);
                    return (
                      <tr key={student.id}>
                        <Td>
                          <div className="font-medium">{student.fullName}</div>
                          <div className="text-xs text-slate-500">{student.studentCode}</div>
                        </Td>
                        <Td>
                          <div className="flex flex-wrap gap-1">
                            {statusOptions.map((status) => (
                              <button
                                key={status}
                                type="button"
                                disabled={locked}
                                className={`rounded-md border px-2 py-1 text-xs font-medium capitalize disabled:opacity-50 ${
                                  marks[student.id]?.status === status ? "border-primary bg-teal-50 text-primary" : "border-border bg-white text-slate-600"
                                }`}
                                onClick={() =>
                                  setMarks((current) => ({
                                    ...current,
                                    [student.id]: { ...(current[student.id] ?? { notes: "" }), status }
                                  }))
                                }
                              >
                                {status}
                              </button>
                            ))}
                          </div>
                        </Td>
                        <Td>
                          <Input
                            disabled={locked}
                            value={marks[student.id]?.notes ?? ""}
                            onChange={(event) =>
                              setMarks((current) => ({
                                ...current,
                                [student.id]: { ...(current[student.id] ?? { status: "present" }), notes: event.target.value }
                              }))
                            }
                          />
                        </Td>
                        <Td>
                          {record ? (
                            <Badge tone={locked ? "neutral" : "success"}>{locked ? "Closed" : "Editable"}</Badge>
                          ) : (
                            <Badge tone="warning">New</Badge>
                          )}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
              {selectedClassId && selectedDayId && (classStudents?.data ?? []).length === 0 ? (
                <p className="text-sm text-slate-500">No active students are enrolled in this class.</p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Attendance</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <thead>
                  <tr>
                    <Th>Student</Th>
                    <Th>Course</Th>
                    <Th>Status</Th>
                    <Th>Date</Th>
                    <Th>Edit Until</Th>
                  </tr>
                </thead>
                <tbody>
                  {(attendance?.data ?? []).slice(0, 50).map((record) => (
                    <tr key={record.id}>
                      <Td>{record.studentName}</Td>
                      <Td>{record.courseTitle}</Td>
                      <Td>
                        <Badge tone={statusTone(record.status)}>{record.status}</Badge>
                      </Td>
                      <Td>{record.date}</Td>
                      <Td>{record.editableUntil ? new Date(record.editableUntil).toLocaleString() : ""}</Td>
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
