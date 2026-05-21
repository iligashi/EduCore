import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Save, Search, UserCheck, UserX } from "lucide-react";
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
import type { ApiList, ClassRecord, Student } from "../types";

const createSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  studentCode: z.string().min(2),
  department: z.string().min(2),
  semester: z.coerce.number().int().min(1)
});

const editSchema = createSchema.omit({ password: true }).extend({
  status: z.enum(["active", "inactive"])
});

type StudentInput = z.infer<typeof createSchema>;
type StudentEditInput = z.infer<typeof editSchema>;

const selectClassName = "h-10 w-full rounded-md border border-border bg-white px-3 text-sm";

function splitIds(value?: string | null) {
  return value ? value.split(",").map((item) => item.trim()).filter(Boolean) : [];
}

function classLabel(item: ClassRecord) {
  return `${item.courseTitle} / ${item.room}`;
}

export function StudentsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [semesterFilter, setSemesterFilter] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [studentClassIds, setStudentClassIds] = useState<string[]>([]);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const createForm = useForm<StudentInput>({
    resolver: zodResolver(createSchema),
    defaultValues: { password: "Password123!", semester: 1 }
  });
  const editForm = useForm<StudentEditInput>({
    resolver: zodResolver(editSchema),
    defaultValues: { semester: 1, status: "active" }
  });

  useEffect(() => {
    if (!selectedStudent) return;
    editForm.reset({
      fullName: selectedStudent.fullName,
      email: selectedStudent.email,
      studentCode: selectedStudent.studentCode,
      department: selectedStudent.department,
      semester: selectedStudent.semester,
      status: selectedStudent.status === "active" ? "active" : "inactive"
    });
    setStudentClassIds(splitIds(selectedStudent.classIds));
  }, [editForm, selectedStudent]);

  const studentPath = useMemo(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (statusFilter) params.set("status", statusFilter);
    if (classFilter) params.set("classId", classFilter);
    if (departmentFilter.trim()) params.set("department", departmentFilter.trim());
    if (semesterFilter.trim()) params.set("semester", semesterFilter.trim());
    const query = params.toString();
    return query ? `/students?${query}` : "/students";
  }, [classFilter, departmentFilter, search, semesterFilter, statusFilter]);

  const { data } = useQuery({
    queryKey: ["students", studentPath],
    queryFn: () => api.get<ApiList<Student>>(studentPath)
  });
  const { data: classes } = useQuery({
    queryKey: ["classes"],
    queryFn: () => api.get<{ data: ClassRecord[] }>("/courses/classes/all"),
    enabled: user?.role === "admin"
  });

  const createMutation = useMutation({
    mutationFn: (input: StudentInput) => api.post<Student>("/students", input),
    onSuccess: () => {
      createForm.reset({ password: "Password123!", semester: 1 });
      queryClient.invalidateQueries({ queryKey: ["students"] });
    }
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: StudentEditInput & { classIds: string[] } }) => api.put<Student>(`/students/${id}`, input),
    onSuccess: (student) => {
      setSelectedStudent(student);
      setStudentClassIds(splitIds(student.classIds));
      queryClient.invalidateQueries({ queryKey: ["students"] });
    }
  });
  const statusMutation = useMutation({
    mutationFn: (student: Student) =>
      api.put<Student>(`/students/${student.id}`, {
        status: student.status === "active" ? "inactive" : "active"
      }),
    onSuccess: (student) => {
      if (selectedStudent?.id === student.id) setSelectedStudent(student);
      queryClient.invalidateQueries({ queryKey: ["students"] });
    }
  });

  return (
    <>
      <SectionHeader title="Students" description="Student records, class assignments, and account status." />
      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        {user?.role === "admin" ? (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Add Student</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-3" onSubmit={createForm.handleSubmit((values) => createMutation.mutate(values))}>
                  <Input placeholder="Full name" {...createForm.register("fullName")} />
                  <Input placeholder="Email" {...createForm.register("email")} />
                  <Input placeholder="Password" type="password" {...createForm.register("password")} />
                  <Input placeholder="Student code" {...createForm.register("studentCode")} />
                  <Input placeholder="Department" {...createForm.register("department")} />
                  <Input placeholder="Semester" type="number" {...createForm.register("semester")} />
                  <Button className="w-full" disabled={createMutation.isPending}>
                    <Plus size={16} />
                    Save student
                  </Button>
                </form>
              </CardContent>
            </Card>

            {selectedStudent ? (
              <Card>
                <CardHeader>
                  <CardTitle>Edit Student</CardTitle>
                </CardHeader>
                <CardContent>
                  <form
                    className="space-y-3"
                    onSubmit={editForm.handleSubmit((values) =>
                      updateMutation.mutate({
                        id: selectedStudent.id,
                        input: { ...values, classIds: studentClassIds }
                      })
                    )}
                  >
                    <Input placeholder="Full name" {...editForm.register("fullName")} />
                    <Input placeholder="Email" {...editForm.register("email")} />
                    <Input placeholder="Student code" {...editForm.register("studentCode")} />
                    <Input placeholder="Department" {...editForm.register("department")} />
                    <Input placeholder="Semester" type="number" {...editForm.register("semester")} />
                    <select className={selectClassName} {...editForm.register("status")}>
                      <option value="active">Active</option>
                      <option value="inactive">Suspended</option>
                    </select>
                    <div className="rounded-md border border-border">
                      <div className="border-b border-border px-3 py-2 text-xs font-semibold uppercase text-slate-500">Assigned classes</div>
                      <div className="max-h-56 overflow-y-auto">
                        {(classes?.data ?? []).map((item) => (
                          <label key={item.id} className="flex items-start gap-2 border-b border-border p-3 text-sm last:border-b-0">
                            <input
                              className="mt-1"
                              type="checkbox"
                              checked={studentClassIds.includes(item.id)}
                              onChange={(event) => {
                                setStudentClassIds((current) =>
                                  event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id)
                                );
                              }}
                            />
                            <span>
                              <span className="block font-medium">{classLabel(item)}</span>
                              {item.instructorName ? <span className="block text-xs text-slate-500">{item.instructorName}</span> : null}
                            </span>
                          </label>
                        ))}
                        {(classes?.data ?? []).length === 0 ? <p className="p-3 text-sm text-slate-500">No classes available.</p> : null}
                      </div>
                    </div>
                    <Button className="w-full" disabled={updateMutation.isPending}>
                      <Save size={16} />
                      Update student
                    </Button>
                  </form>
                </CardContent>
              </Card>
            ) : null}
          </div>
        ) : null}

        <Card className={user?.role === "admin" ? "" : "xl:col-span-2"}>
          <CardHeader>
            <div className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle>Student Directory</CardTitle>
                <div className="relative w-full sm:w-72">
                  <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                  <Input className="pl-9" placeholder="Search students" value={search} onChange={(event) => setSearch(event.target.value)} />
                </div>
              </div>
              <div className="grid gap-2 md:grid-cols-[150px_minmax(180px,1fr)_minmax(150px,1fr)_120px]">
                <select className={selectClassName} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="">All statuses</option>
                  <option value="active">Active</option>
                  <option value="inactive">Suspended</option>
                </select>
                <select className={selectClassName} value={classFilter} onChange={(event) => setClassFilter(event.target.value)}>
                  <option value="">All classes</option>
                  {(classes?.data ?? []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {classLabel(item)}
                    </option>
                  ))}
                </select>
                <Input placeholder="Department filter" value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)} />
                <Input placeholder="Semester" type="number" value={semesterFilter} onChange={(event) => setSemesterFilter(event.target.value)} />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Class</Th>
                  <Th>Code</Th>
                  <Th>Department</Th>
                  <Th>Semester</Th>
                  <Th>Status</Th>
                  {user?.role === "admin" ? <Th>Actions</Th> : null}
                </tr>
              </thead>
              <tbody>
                {(data?.data ?? []).map((student) => (
                  <tr key={student.id}>
                    <Td>
                      <div className="font-medium">{student.fullName}</div>
                      <div className="text-xs text-slate-500">{student.email}</div>
                    </Td>
                    <Td className="max-w-xs text-sm text-slate-600">{student.classNames ?? "No class assigned"}</Td>
                    <Td>{student.studentCode}</Td>
                    <Td>{student.department}</Td>
                    <Td>{student.semester}</Td>
                    <Td>
                      <Badge tone={student.status === "active" ? "success" : "danger"}>
                        {student.status === "active" ? "active" : "suspended"}
                      </Badge>
                    </Td>
                    {user?.role === "admin" ? (
                      <Td>
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => setSelectedStudent(student)}>
                            <Pencil size={14} />
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant={student.status === "active" ? "danger" : "outline"}
                            size="sm"
                            disabled={statusMutation.isPending}
                            onClick={() => statusMutation.mutate(student)}
                          >
                            {student.status === "active" ? <UserX size={14} /> : <UserCheck size={14} />}
                            {student.status === "active" ? "Suspend" : "Activate"}
                          </Button>
                        </div>
                      </Td>
                    ) : null}
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
