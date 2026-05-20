import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
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
import type { ApiList, Instructor } from "../types";

const schema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  specialization: z.string().min(2)
});

type InstructorInput = z.infer<typeof schema>;

export function InstructorsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const form = useForm<InstructorInput>({
    resolver: zodResolver(schema),
    defaultValues: { password: "Password123!" }
  });
  const { data } = useQuery({
    queryKey: ["instructors"],
    queryFn: () => api.get<ApiList<Instructor>>("/instructors")
  });
  const createMutation = useMutation({
    mutationFn: (input: InstructorInput) => api.post<Instructor>("/instructors", input),
    onSuccess: () => {
      form.reset({ password: "Password123!" });
      queryClient.invalidateQueries({ queryKey: ["instructors"] });
    }
  });

  return (
    <>
      <SectionHeader title="Instructors" description="Teaching staff profiles and specializations." />
      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        {user?.role === "admin" ? (
          <Card>
            <CardHeader>
              <CardTitle>Add Instructor</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}>
                <Input placeholder="Full name" {...form.register("fullName")} />
                <Input placeholder="Email" {...form.register("email")} />
                <Input placeholder="Password" type="password" {...form.register("password")} />
                <Input placeholder="Specialization" {...form.register("specialization")} />
                <Button className="w-full" disabled={createMutation.isPending}>
                  <Plus size={16} />
                  Save instructor
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : null}
        <Card className={user?.role === "admin" ? "" : "xl:col-span-2"}>
          <CardHeader>
            <CardTitle>Instructor Directory</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Specialization</Th>
                  <Th>Status</Th>
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
                    <Td>
                      <Badge tone={instructor.status === "active" ? "success" : "neutral"}>{instructor.status}</Badge>
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

