import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Pencil, Plus, Save, Search, UserCheck, UserX } from "lucide-react";
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
import type { ApiList, ClassRecord, Instructor } from "../types";

const createSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  specialization: z.string().min(2)
});

const editSchema = createSchema.omit({ password: true }).extend({
  status: z.enum(["active", "inactive"])
});

type InstructorInput = z.infer<typeof createSchema>;
type InstructorEditInput = z.infer<typeof editSchema>;

const selectClassName = "h-10 w-full rounded-md border border-border bg-white px-3 text-sm";

function classLabel(item: ClassRecord) {
  return `${item.courseTitle} / ${item.room}`;
}

export function InstructorsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [specializationFilter, setSpecializationFilter] = useState("");
  const [selectedInstructor, setSelectedInstructor] = useState<Instructor | null>(null);
  const [resetPassword, setResetPassword] = useState("Password123!");
  const [assignedClassId, setAssignedClassId] = useState("");
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const createForm = useForm<InstructorInput>({
    resolver: zodResolver(createSchema),
    defaultValues: { password: "Password123!" }
  });
  const editForm = useForm<InstructorEditInput>({
    resolver: zodResolver(editSchema),
    defaultValues: { status: "active" }
  });

  useEffect(() => {
    if (!selectedInstructor) return;
    editForm.reset({
      fullName: selectedInstructor.fullName,
      email: selectedInstructor.email,
      specialization: selectedInstructor.specialization,
      status: selectedInstructor.status === "active" ? "active" : "inactive"
    });
    setAssignedClassId("");
    setResetPassword("Password123!");
  }, [editForm, selectedInstructor]);

  const instructorPath = useMemo(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (statusFilter) params.set("status", statusFilter);
    if (classFilter) params.set("classId", classFilter);
    if (specializationFilter.trim()) params.set("specialization", specializationFilter.trim());
    const query = params.toString();
    return query ? `/instructors?${query}` : "/instructors";
  }, [classFilter, search, specializationFilter, statusFilter]);

  const { data } = useQuery({
    queryKey: ["instructors", instructorPath],
    queryFn: () => api.get<ApiList<Instructor>>(instructorPath)
  });
  const { data: classes } = useQuery({
    queryKey: ["classes"],
    queryFn: () => api.get<{ data: ClassRecord[] }>("/courses/classes/all"),
    enabled: user?.role === "admin"
  });

  const createMutation = useMutation({
    mutationFn: (input: InstructorInput) => api.post<Instructor>("/instructors", input),
    onSuccess: () => {
      createForm.reset({ password: "Password123!" });
      queryClient.invalidateQueries({ queryKey: ["instructors"] });
    }
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: InstructorEditInput }) => api.put<Instructor>(`/instructors/${id}`, input),
    onSuccess: (instructor) => {
      setSelectedInstructor(instructor);
      queryClient.invalidateQueries({ queryKey: ["instructors"] });
    }
  });
  const statusMutation = useMutation({
    mutationFn: (instructor: Instructor) =>
      api.put<Instructor>(`/instructors/${instructor.id}`, {
        status: instructor.status === "active" ? "inactive" : "active"
      }),
    onSuccess: (instructor) => {
      if (selectedInstructor?.id === instructor.id) setSelectedInstructor(instructor);
      queryClient.invalidateQueries({ queryKey: ["instructors"] });
    }
  });
  const resetPasswordMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) => api.post(`/instructors/${id}/reset-password`, { password }),
    onSuccess: () => {
      setResetPassword("Password123!");
    }
  });
  const assignClassMutation = useMutation({
    mutationFn: ({ id, classId }: { id: string; classId: string }) => api.put<Instructor>(`/instructors/${id}/class-assignment`, { classId }),
    onSuccess: (instructor) => {
      setSelectedInstructor(instructor);
      setAssignedClassId("");
      queryClient.invalidateQueries({ queryKey: ["instructors"] });
      queryClient.invalidateQueries({ queryKey: ["classes"] });
      queryClient.invalidateQueries({ queryKey: ["courses"] });
    }
  });

  return (
    <>
      <SectionHeader title="Instructors" description="Teaching staff profiles, class assignments, and account status." />
      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        {user?.role === "admin" ? (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Add Instructor</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-3" onSubmit={createForm.handleSubmit((values) => createMutation.mutate(values))}>
                  <Input placeholder="Full name" {...createForm.register("fullName")} />
                  <Input placeholder="Email" {...createForm.register("email")} />
                  <Input placeholder="Password" type="password" {...createForm.register("password")} />
                  <Input placeholder="Specialization" {...createForm.register("specialization")} />
                  <Button className="w-full" disabled={createMutation.isPending}>
                    <Plus size={16} />
                    Save instructor
                  </Button>
                </form>
              </CardContent>
            </Card>

            {selectedInstructor ? (
              <Card>
                <CardHeader>
                  <CardTitle>Edit Instructor</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <form
                    className="space-y-3"
                    onSubmit={editForm.handleSubmit((values) =>
                      updateMutation.mutate({
                        id: selectedInstructor.id,
                        input: values
                      })
                    )}
                  >
                    <Input placeholder="Full name" {...editForm.register("fullName")} />
                    <Input placeholder="Email" {...editForm.register("email")} />
                    <Input placeholder="Specialization" {...editForm.register("specialization")} />
                    <select className={selectClassName} {...editForm.register("status")}>
                      <option value="active">Active</option>
                      <option value="inactive">Suspended</option>
                    </select>
                    <Button className="w-full" disabled={updateMutation.isPending}>
                      <Save size={16} />
                      Update instructor
                    </Button>
                  </form>

                  <div className="space-y-3 rounded-md border border-border p-3">
                    <div className="text-xs font-semibold uppercase text-slate-500">Password reset</div>
                    <Input type="password" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} />
                    <Button
                      type="button"
                      className="w-full"
                      variant="outline"
                      disabled={resetPassword.length < 8 || resetPasswordMutation.isPending}
                      onClick={() => resetPasswordMutation.mutate({ id: selectedInstructor.id, password: resetPassword })}
                    >
                      <KeyRound size={16} />
                      Reset password
                    </Button>
                  </div>

                  <div className="space-y-3 rounded-md border border-border p-3">
                    <div className="text-xs font-semibold uppercase text-slate-500">Class assignment</div>
                    <select className={selectClassName} value={assignedClassId} onChange={(event) => setAssignedClassId(event.target.value)}>
                      <option value="">Select class</option>
                      {(classes?.data ?? []).map((item) => (
                        <option key={item.id} value={item.id}>
                          {classLabel(item)}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      className="w-full"
                      variant="outline"
                      disabled={!assignedClassId || assignClassMutation.isPending}
                      onClick={() => assignClassMutation.mutate({ id: selectedInstructor.id, classId: assignedClassId })}
                    >
                      <Save size={16} />
                      Assign class
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </div>
        ) : null}

        <Card className={user?.role === "admin" ? "" : "xl:col-span-2"}>
          <CardHeader>
            <div className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle>Instructor Directory</CardTitle>
                <div className="relative w-full sm:w-72">
                  <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                  <Input className="pl-9" placeholder="Search instructors" value={search} onChange={(event) => setSearch(event.target.value)} />
                </div>
              </div>
              <div className="grid gap-2 md:grid-cols-[150px_minmax(180px,1fr)_minmax(150px,1fr)]">
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
                <Input placeholder="Specialization filter" value={specializationFilter} onChange={(event) => setSpecializationFilter(event.target.value)} />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Specialization</Th>
                  <Th>Assigned Classes</Th>
                  <Th>Status</Th>
                  {user?.role === "admin" ? <Th>Actions</Th> : null}
                </tr>
              </thead>
              <tbody>
                {(data?.data ?? []).map((instructor) => (
                  <tr key={instructor.id}>
                    <Td>
                      <div className="font-medium">{instructor.fullName}</div>
                      <div className="text-xs text-slate-500">{instructor.email}</div>
                    </Td>
                    <Td>{instructor.specialization}</Td>
                    <Td className="max-w-xs text-sm text-slate-600">{instructor.classNames ?? "No class assigned"}</Td>
                    <Td>
                      <Badge tone={instructor.status === "active" ? "success" : "danger"}>
                        {instructor.status === "active" ? "active" : "suspended"}
                      </Badge>
                    </Td>
                    {user?.role === "admin" ? (
                      <Td>
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => setSelectedInstructor(instructor)}>
                            <Pencil size={14} />
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant={instructor.status === "active" ? "danger" : "outline"}
                            size="sm"
                            disabled={statusMutation.isPending}
                            onClick={() => statusMutation.mutate(instructor)}
                          >
                            {instructor.status === "active" ? <UserX size={14} /> : <UserCheck size={14} />}
                            {instructor.status === "active" ? "Suspend" : "Activate"}
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
