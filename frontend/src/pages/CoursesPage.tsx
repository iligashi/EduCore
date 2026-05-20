import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Input, Textarea } from "../components/ui/Input";
import { SectionHeader } from "../components/ui/SectionHeader";
import { Table, Td, Th } from "../components/ui/Table";
import { useAuth } from "../features/auth/AuthProvider";
import { api } from "../services/api";
import type { ApiList, Course, Instructor } from "../types";

const schema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  instructorId: z.string().optional(),
  level: z.string().default("General"),
  status: z.enum(["draft", "published", "archived"]).default("draft")
});

type CourseInput = z.infer<typeof schema>;

export function CoursesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const form = useForm<CourseInput>({
    resolver: zodResolver(schema),
    defaultValues: { level: "General", status: "draft" }
  });
  const { data } = useQuery({ queryKey: ["courses"], queryFn: () => api.get<ApiList<Course>>("/courses") });
  const { data: instructors } = useQuery({
    queryKey: ["instructors"],
    queryFn: () => api.get<ApiList<Instructor>>("/instructors"),
    enabled: user?.role === "admin"
  });
  const createMutation = useMutation({
    mutationFn: (input: CourseInput) => api.post<Course>("/courses", input),
    onSuccess: () => {
      form.reset({ level: "General", status: "draft" });
      queryClient.invalidateQueries({ queryKey: ["courses"] });
    }
  });

  return (
    <>
      <SectionHeader title="Courses" description="Course catalog, instructors, publishing state, and class planning." />
      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        {user?.role !== "student" ? (
          <Card>
            <CardHeader>
              <CardTitle>Create Course</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}>
                <Input placeholder="Course title" {...form.register("title")} />
                <Textarea placeholder="Description" {...form.register("description")} />
                <Input placeholder="Level" {...form.register("level")} />
                {user?.role === "admin" ? (
                  <select className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm" {...form.register("instructorId")}>
                    <option value="">Select instructor</option>
                    {(instructors?.data ?? []).map((instructor) => (
                      <option key={instructor.id} value={instructor.id}>
                        {instructor.fullName}
                      </option>
                    ))}
                  </select>
                ) : null}
                <select className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm" {...form.register("status")}>
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="archived">Archived</option>
                </select>
                <Button className="w-full" disabled={createMutation.isPending}>
                  <Plus size={16} />
                  Save course
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : null}
        <Card className={user?.role !== "student" ? "" : "xl:col-span-2"}>
          <CardHeader>
            <CardTitle>Course Catalog</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <thead>
                <tr>
                  <Th>Course</Th>
                  <Th>Instructor</Th>
                  <Th>Level</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {(data?.data ?? []).map((course) => (
                  <tr key={course.id}>
                    <Td>
                      <div className="font-medium">{course.title}</div>
                      <div className="max-w-xl text-xs text-slate-500">{course.description}</div>
                    </Td>
                    <Td>{course.instructorName ?? course.instructorId}</Td>
                    <Td>{course.level}</Td>
                    <Td>
                      <Badge tone={course.status === "published" ? "success" : course.status === "archived" ? "neutral" : "warning"}>
                        {course.status}
                      </Badge>
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

