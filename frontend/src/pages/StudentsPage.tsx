import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
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
import type { ApiList, Student } from "../types";

const schema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  studentCode: z.string().min(2),
  department: z.string().min(2),
  semester: z.coerce.number().int().min(1)
});

type StudentInput = z.infer<typeof schema>;

export function StudentsPage() {
  const [search, setSearch] = useState("");
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const form = useForm<StudentInput>({
    resolver: zodResolver(schema),
    defaultValues: { password: "Password123!", semester: 1 }
  });
  const { data } = useQuery({
    queryKey: ["students", search],
    queryFn: () => api.get<ApiList<Student>>(`/students?search=${encodeURIComponent(search)}`)
  });
  const createMutation = useMutation({
    mutationFn: (input: StudentInput) => api.post<Student>("/students", input),
    onSuccess: () => {
      form.reset({ password: "Password123!", semester: 1 });
      queryClient.invalidateQueries({ queryKey: ["students"] });
    }
  });

  return (
    <>
      <SectionHeader title="Students" description="Student records, departments, semesters, and account status." />
      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        {user?.role === "admin" ? (
          <Card>
            <CardHeader>
              <CardTitle>Add Student</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}>
                <Input placeholder="Full name" {...form.register("fullName")} />
                <Input placeholder="Email" {...form.register("email")} />
                <Input placeholder="Password" type="password" {...form.register("password")} />
                <Input placeholder="Student code" {...form.register("studentCode")} />
                <Input placeholder="Department" {...form.register("department")} />
                <Input placeholder="Semester" type="number" {...form.register("semester")} />
                <Button className="w-full" disabled={createMutation.isPending}>
                  <Plus size={16} />
                  Save student
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : null}
        <Card className={user?.role === "admin" ? "" : "xl:col-span-2"}>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle>Student Directory</CardTitle>
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                <Input className="pl-9" placeholder="Search students" value={search} onChange={(event) => setSearch(event.target.value)} />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Code</Th>
                  <Th>Department</Th>
                  <Th>Semester</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {(data?.data ?? []).map((student) => (
                  <tr key={student.id}>
                    <Td>
                      <div className="font-medium">{student.fullName}</div>
                      <div className="text-xs text-slate-500">{student.email}</div>
                    </Td>
                    <Td>{student.studentCode}</Td>
                    <Td>{student.department}</Td>
                    <Td>{student.semester}</Td>
                    <Td>
                      <Badge tone={student.status === "active" ? "success" : "neutral"}>{student.status}</Badge>
                    </Td>
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

