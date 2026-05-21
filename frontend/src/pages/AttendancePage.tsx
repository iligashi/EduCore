import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { SectionHeader } from "../components/ui/SectionHeader";
import { Table, Td, Th } from "../components/ui/Table";
import { api } from "../services/api";
import type { AttendanceRecord, ClassDay, ClassRecord, Student } from "../types";

type AttendanceStatus = "present" | "absent" | "late" | "excused";

interface MarkState {
  status: AttendanceStatus;
  notes: string;
}

function editable(record?: AttendanceRecord) {
  if (!record) return true;
  return record.isEditable === true || record.isEditable === 1;
}

export function AttendancePage() {
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["attendance"] })
  });

  return (
    <>
      <SectionHeader title="Attendance" description="Open a class day, take attendance once, and edit within the 2-hour window." />
      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Open Attendance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <select className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm" value={selectedClassId} onChange={(event) => {
              setSelectedClassId(event.target.value);
              setSelectedDayId("");
            }}>
              <option value="">Select class</option>
              {(classes?.data ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.courseTitle} / {item.room}
                </option>
              ))}
            </select>
            <select className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm" value={selectedDayId} onChange={(event) => setSelectedDayId(event.target.value)}>
              <option value="">Select course day</option>
              {(days?.data ?? []).map((day) => (
                <option key={day._id} value={day._id}>
                  Day {day.dayNumber}: {day.title}
                </option>
              ))}
            </select>
            <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            <Button className="w-full" disabled={!selectedClassId || !selectedDayId || bulkSave.isPending} onClick={() => bulkSave.mutate()}>
              <Check size={16} />
              Save attendance
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Class Roster</CardTitle>
          </CardHeader>
          <CardContent>
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
                        <select
                          className="h-9 rounded-md border border-border bg-white px-2 text-sm"
                          disabled={locked}
                          value={marks[student.id]?.status ?? "present"}
                          onChange={(event) =>
                            setMarks((current) => ({
                              ...current,
                              [student.id]: { ...(current[student.id] ?? { notes: "" }), status: event.target.value as AttendanceStatus }
                            }))
                          }
                        >
                          <option value="present">Present</option>
                          <option value="absent">Absent</option>
                          <option value="late">Late</option>
                          <option value="excused">Excused</option>
                        </select>
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
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Attendance History</CardTitle>
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
                {(attendance?.data ?? []).map((record) => (
                  <tr key={record.id}>
                    <Td>{record.studentName}</Td>
                    <Td>{record.courseTitle}</Td>
                    <Td>
                      <Badge tone={record.status === "present" ? "success" : record.status === "absent" ? "danger" : "warning"}>{record.status}</Badge>
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
    </>
  );
}

