import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { SectionHeader } from "../components/ui/SectionHeader";
import { Table, Td, Th } from "../components/ui/Table";
import { useAuth } from "../features/auth/AuthProvider";
import { api } from "../services/api";
import type { ApiList, AttendanceRecord, Student } from "../types";

interface ClassRecord {
  id: string;
  courseTitle: string;
  room: string;
}

const schema = z.object({
  studentId: z.string().uuid(),
  classId: z.string().uuid(),
  status: z.enum(["present", "absent", "late", "excused"]),
  date: z.string().min(1),
  notes: z.string().optional()
});

export function AttendancePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { status: "present", date: new Date().toISOString().slice(0, 10) }
  });
  const { data: attendance } = useQuery({
    queryKey: ["attendance"],
    queryFn: () => api.get<{ data: AttendanceRecord[] }>("/attendance")
  });
  const { data: students } = useQuery({
    queryKey: ["students"],
    queryFn: () => api.get<ApiList<Student>>("/students"),
    enabled: user?.role !== "student"
  });
  const { data: classes } = useQuery({
    queryKey: ["classes"],
    queryFn: () => api.get<{ data: ClassRecord[] }>("/courses/classes/all"),
    enabled: user?.role !== "student"
  });
  const mutation = useMutation({
    mutationFn: (values: z.infer<typeof schema>) => api.post("/attendance", values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
    }
  });

  return (
    <>
      <SectionHeader title="Attendance" description="Track daily class attendance and status history." />
      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        {user?.role !== "student" ? (
          <Card>
            <CardHeader>
              <CardTitle>Record Attendance</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
                <select className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm" {...form.register("studentId")}>
                  <option value="">Select student</option>
                  {(students?.data ?? []).map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.fullName}
                    </option>
                  ))}
                </select>
                <select className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm" {...form.register("classId")}>
                  <option value="">Select class</option>
                  {(classes?.data ?? []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.courseTitle} / {item.room}
                    </option>
                  ))}
                </select>
                <select className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm" {...form.register("status")}>
                  <option value="present">Present</option>
                  <option value="absent">Absent</option>
                  <option value="late">Late</option>
                  <option value="excused">Excused</option>
                </select>
                <Input type="date" {...form.register("date")} />
                <Input placeholder="Notes" {...form.register("notes")} />
                <Button className="w-full" disabled={mutation.isPending}>
                  <Check size={16} />
                  Save attendance
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : null}
        <Card className={user?.role !== "student" ? "" : "xl:col-span-2"}>
          <CardHeader>
            <CardTitle>Attendance Log</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <thead>
                <tr>
                  <Th>Student</Th>
                  <Th>Course</Th>
                  <Th>Status</Th>
                  <Th>Date</Th>
                  <Th>Notes</Th>
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
                    <Td>{record.notes}</Td>
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

