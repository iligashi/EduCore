import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Plus } from "lucide-react";
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
import type { ApiList, ClassRecord, Course, Instructor } from "../types";

const schema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  instructorId: z.string().optional(),
  level: z.string().default("General"),
  status: z.enum(["draft", "published", "archived"]).default("draft")
});

type CourseInput = z.infer<typeof schema>;

const classSchema = z.object({
  courseId: z.string().uuid(),
  room: z.string().min(1),
  scheduleText: z.string().min(1),
  startsAt: z.string().optional(),
  endsAt: z.string().optional()
});

type ClassInput = z.infer<typeof classSchema>;

const enrollmentSchema = z.object({
  classId: z.string().uuid(),
  studentId: z.string().uuid()
});

type EnrollmentInput = z.infer<typeof enrollmentSchema>;

export function CoursesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const form = useForm<CourseInput>({
    resolver: zodResolver(schema),
    defaultValues: { level: "General", status: "draft" }
  });
  const classForm = useForm<ClassInput>({
    resolver: zodResolver(classSchema)
  });
  const enrollmentForm = useForm<EnrollmentInput>({
    resolver: zodResolver(enrollmentSchema)
  });
  const { data } = useQuery({ queryKey: ["courses"], queryFn: () => api.get<ApiList<Course>>("/courses") });
  const { data: classes } = useQuery({ queryKey: ["classes"], queryFn: () => api.get<{ data: ClassRecord[] }>("/courses/classes/all") });
  const { data: students } = useQuery({
    queryKey: ["students"],
    queryFn: () => api.get<ApiList<{ id: string; fullName: string; studentCode: string }>>("/students"),
    enabled: user?.role === "admin"
  });
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
  const createClassMutation = useMutation({
    mutationFn: (input: ClassInput) =>
      api.post(`/courses/${input.courseId}/classes`, {
        room: input.room,
        schedule: { note: input.scheduleText },
        startsAt: input.startsAt ? new Date(input.startsAt).toISOString() : undefined,
        endsAt: input.endsAt ? new Date(input.endsAt).toISOString() : undefined
      }),
    onSuccess: () => {
      classForm.reset();
      queryClient.invalidateQueries({ queryKey: ["classes"] });
    }
  });
  const enrollMutation = useMutation({
    mutationFn: (input: EnrollmentInput) => api.post(`/courses/classes/${input.classId}/enrollments`, { studentId: input.studentId }),
    onSuccess: () => {
      enrollmentForm.reset();
      queryClient.invalidateQueries({ queryKey: ["classes"] });
    }
  });

  return (
    <>
      <SectionHeader title="Courses" description="Course catalog, instructors, publishing state, and class planning." />
      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        {user?.role === "admin" ? (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Create Course</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-3" onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}>
                  <Input placeholder="Course title" {...form.register("title")} />
                  <Textarea placeholder="Description" {...form.register("description")} />
                  <Input placeholder="Level" {...form.register("level")} />
                  <select className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm" {...form.register("instructorId")}>
                    <option value="">Select instructor</option>
                    {(instructors?.data ?? []).map((instructor) => (
                      <option key={instructor.id} value={instructor.id}>
                        {instructor.fullName}
                      </option>
                    ))}
                  </select>
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
            <Card>
              <CardHeader>
                <CardTitle>Create Assigned Class</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-3" onSubmit={classForm.handleSubmit((values) => createClassMutation.mutate(values))}>
                  <select className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm" {...classForm.register("courseId")}>
                    <option value="">Select course</option>
                    {(data?.data ?? []).map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.title} / {course.instructorName}
                      </option>
                    ))}
                  </select>
                  <Input placeholder="Room" {...classForm.register("room")} />
                  <Input placeholder="Schedule note" {...classForm.register("scheduleText")} />
                  <Input type="datetime-local" {...classForm.register("startsAt")} />
                  <Input type="datetime-local" {...classForm.register("endsAt")} />
                  <Button className="w-full" disabled={createClassMutation.isPending}>
                    <CalendarPlus size={16} />
                    Assign class
                  </Button>
                </form>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Assign Student To Class</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-3" onSubmit={enrollmentForm.handleSubmit((values) => enrollMutation.mutate(values))}>
                  <select className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm" {...enrollmentForm.register("classId")}>
                    <option value="">Select class</option>
                    {(classes?.data ?? []).map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.courseTitle} / {item.room}
                      </option>
                    ))}
                  </select>
                  <select className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm" {...enrollmentForm.register("studentId")}>
                    <option value="">Select student</option>
                    {(students?.data ?? []).map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.fullName} / {student.studentCode}
                      </option>
                    ))}
                  </select>
                  <Button className="w-full" disabled={enrollMutation.isPending}>
                    <Plus size={16} />
                    Assign student
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        ) : null}
        <div className={user?.role === "admin" ? "space-y-6" : "space-y-6 xl:col-span-2"}>
        <Card>
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
        <Card>
          <CardHeader>
            <CardTitle>Classes</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <thead>
                <tr>
                  <Th>Class</Th>
                  <Th>Room</Th>
                  <Th>Schedule</Th>
                </tr>
              </thead>
              <tbody>
                {(classes?.data ?? []).map((item) => (
                  <tr key={item.id}>
                    <Td>{item.courseTitle}</Td>
                    <Td>{item.room}</Td>
                    <Td>{typeof item.schedule === "string" ? item.schedule : JSON.stringify(item.schedule)}</Td>
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
