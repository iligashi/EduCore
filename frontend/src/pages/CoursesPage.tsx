import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, CalendarDays, CalendarPlus, Clock, MapPin, Plus, UserRound } from "lucide-react";
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

function scheduleLabel(schedule: ClassRecord["schedule"]) {
  if (!schedule) return "Schedule not set";
  const parsed = typeof schedule === "string" ? tryParseSchedule(schedule) : schedule;
  if (typeof parsed === "string") return parsed;
  const days = Array.isArray(parsed.days) ? parsed.days.join(", ") : "";
  const time = typeof parsed.time === "string" ? parsed.time : "";
  const note = typeof parsed.note === "string" ? parsed.note : "";
  return [days, time, note].filter(Boolean).join(" / ") || "Schedule not set";
}

function tryParseSchedule(value: string): Record<string, unknown> | string {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return value;
  }
}

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

  if (user?.role === "student") {
    return <StudentCoursesView courses={data?.data ?? []} classes={classes?.data ?? []} />;
  }

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

function StudentCoursesView({ courses, classes }: { courses: Course[]; classes: ClassRecord[] }) {
  return (
    <>
      <SectionHeader title="My Courses" description="Your enrolled classes in one place." />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {courses.map((course) => {
            const courseClasses = classes.filter((item) => item.courseId === course.id);
            return (
              <Card key={course.id}>
                <CardContent className="p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-teal-50 text-primary">
                        <BookOpen size={22} />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-lg font-semibold text-slate-950">{course.title}</h2>
                          <Badge tone={course.status === "published" ? "success" : "neutral"}>{course.status}</Badge>
                        </div>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{course.description || "No description added."}</p>
                      </div>
                    </div>
                    <Badge tone="info">{course.level}</Badge>
                  </div>

                  <div className="mt-5 grid gap-3 md:grid-cols-3">
                    <div className="rounded-md bg-muted p-3">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
                        <UserRound size={14} />
                        Instructor
                      </div>
                      <p className="mt-1 text-sm font-medium">{course.instructorName ?? "Not assigned"}</p>
                    </div>
                    <div className="rounded-md bg-muted p-3">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
                        <CalendarDays size={14} />
                        Classes
                      </div>
                      <p className="mt-1 text-sm font-medium">{courseClasses.length}</p>
                    </div>
                    <div className="rounded-md bg-muted p-3">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
                        <Clock size={14} />
                        Next
                      </div>
                      <p className="mt-1 text-sm font-medium">{courseClasses[0]?.startsAt ? new Date(courseClasses[0].startsAt).toLocaleDateString() : "No date"}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {courses.length === 0 ? (
            <Card>
              <CardContent>
                <p className="text-sm text-slate-500">No enrolled courses yet.</p>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Class Schedule</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {classes.map((item) => (
                <div key={item.id} className="rounded-md border border-border p-3">
                  <p className="font-medium">{item.courseTitle}</p>
                  <div className="mt-2 space-y-2 text-sm text-slate-600">
                    <div className="flex items-center gap-2">
                      <MapPin size={15} className="text-primary" />
                      {item.room}
                    </div>
                    <div className="flex items-center gap-2">
                      <CalendarDays size={15} className="text-primary" />
                      {scheduleLabel(item.schedule)}
                    </div>
                  </div>
                </div>
              ))}
              {classes.length === 0 ? <p className="text-sm text-slate-500">No classes scheduled yet.</p> : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
