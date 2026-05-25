import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BookOpen, CheckCircle2, GraduationCap, LibraryBig, Send, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { z } from "zod";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Input, Textarea } from "../components/ui/Input";
import { api } from "../services/api";
import type { CourseApplication, PublicCourse } from "../types";

const applicationSchema = z.object({
  fullName: z.string().min(2, "Enter your full name"),
  email: z.string().email("Enter a valid email"),
  phone: z.string().max(40).optional(),
  courseId: z.string().optional(),
  educationLevel: z.string().max(120).optional(),
  message: z.string().max(1200).optional()
});

type ApplicationInput = z.infer<typeof applicationSchema>;

const inputLabel = "mb-1.5 block text-sm font-medium text-slate-800";
const anchorClass =
  "inline-flex h-10 items-center justify-center rounded-md border border-white/70 px-4 text-sm font-medium text-white transition hover:bg-white hover:text-slate-950";

function formatDate(value?: string | null) {
  if (!value) return "Dates announced by admissions";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function PublicHomePage() {
  const [submittedApplication, setSubmittedApplication] = useState<CourseApplication | null>(null);
  const { data: courses, isLoading } = useQuery({
    queryKey: ["public-courses"],
    queryFn: () => api.get<{ data: PublicCourse[] }>("/public/courses")
  });
  const courseOptions = courses?.data ?? [];
  const featuredCourses = useMemo(() => courseOptions.slice(0, 3), [courseOptions]);

  const form = useForm<ApplicationInput>({
    resolver: zodResolver(applicationSchema),
    defaultValues: {
      fullName: "",
      email: "",
      phone: "",
      courseId: "",
      educationLevel: "",
      message: ""
    }
  });

  const applicationMutation = useMutation({
    mutationFn: (input: ApplicationInput) => api.post<CourseApplication>("/public/course-applications", input),
    onSuccess: (application) => {
      setSubmittedApplication(application);
      form.reset({
        fullName: "",
        email: "",
        phone: "",
        courseId: "",
        educationLevel: "",
        message: ""
      });
    }
  });

  return (
    <div className="min-h-screen bg-[#f6f8f7] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-md border border-slate-300 bg-slate-950 text-white">
              <GraduationCap size={24} />
            </div>
            <div>
              <p className="text-lg font-semibold tracking-normal">EduCore</p>
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">LMS & DMS</p>
            </div>
          </Link>
          <nav className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-700">
            <a className="rounded-md px-3 py-2 hover:bg-slate-100" href="#about">
              About
            </a>
            <a className="rounded-md px-3 py-2 hover:bg-slate-100" href="#courses">
              Courses
            </a>
            <a className="rounded-md px-3 py-2 hover:bg-slate-100" href="#apply">
              Apply
            </a>
            <Link className="rounded-md border border-slate-300 px-3 py-2 hover:bg-slate-100" to="/login">
              Portal Login
            </Link>
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden bg-slate-950">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-65"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1523050854058-8df90110c9f1?auto=format&fit=crop&w=1800&q=80')"
          }}
        />
        <div className="absolute inset-0 bg-slate-950/55" />
        <div className="relative mx-auto flex min-h-[520px] max-w-7xl items-center px-4 py-20 lg:px-8">
          <div className="max-w-3xl text-white">
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-white/80">Course applications now open</p>
            <h1 className="text-4xl font-semibold leading-tight tracking-normal sm:text-5xl">
              A practical education office for courses, students, and academic records.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-white/85">
              EduCore helps a school publish courses, manage student records, run classes, track attendance, share learning content, and keep
              administration in one clear system.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a className="inline-flex h-10 items-center justify-center rounded-md bg-white px-4 text-sm font-medium text-slate-950 transition hover:bg-slate-200" href="#apply">
                Apply for a course
              </a>
              <a className={anchorClass} href="#courses">
                View courses
              </a>
            </div>
          </div>
        </div>
      </section>

      <main>
        <section id="about" className="border-b border-slate-200 bg-white">
          <div className="mx-auto grid max-w-7xl gap-8 px-4 py-14 lg:grid-cols-[0.95fr_1.05fr] lg:px-8">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-teal-700">What EduCore Does</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-normal text-slate-950">Built for everyday school operations.</h2>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600">
                EduCore brings the learning side and the office side together. Students see lessons, assignments, notices, and progress. Staff
                manage courses, classes, applications, attendance, reports, and communication from the portal.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                { icon: LibraryBig, title: "Course Catalog", text: "Published programs with instructors, levels, schedules, and class details." },
                { icon: ShieldCheck, title: "Admin Review", text: "New applications are stored privately for administrators to review." },
                { icon: CheckCircle2, title: "Student Support", text: "Records, attendance, lessons, assignments, and notices stay organized." }
              ].map((item) => (
                <div key={item.title} className="rounded-md border border-slate-200 bg-slate-50 p-4">
                  <item.icon className="text-teal-700" size={22} />
                  <h3 className="mt-3 text-base font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="courses" className="border-b border-slate-200 bg-[#f6f8f7]">
          <div className="mx-auto max-w-7xl px-4 py-14 lg:px-8">
            <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-teal-700">Published Courses</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-normal">Choose a course to apply for.</h2>
              </div>
              <a className="text-sm font-medium text-teal-800 hover:text-teal-950" href="#apply">
                Send an application
              </a>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {featuredCourses.map((course) => (
                <article key={course.id} className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <BookOpen className="mt-1 text-teal-700" size={22} />
                    <Badge tone="info">{course.level}</Badge>
                  </div>
                  <h3 className="mt-4 text-lg font-semibold tracking-normal">{course.title}</h3>
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{course.description || "Course details will be shared by admissions."}</p>
                  <dl className="mt-5 space-y-2 text-sm">
                    <div className="flex justify-between gap-4 border-t border-slate-100 pt-3">
                      <dt className="text-slate-500">Instructor</dt>
                      <dd className="font-medium text-slate-800">{course.instructorName ?? "To be assigned"}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500">Classes</dt>
                      <dd className="font-medium text-slate-800">{course.classCount}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500">Next start</dt>
                      <dd className="font-medium text-slate-800">{formatDate(course.nextStartAt)}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>

            {!isLoading && featuredCourses.length === 0 ? (
              <div className="rounded-md border border-slate-200 bg-white p-5 text-sm text-slate-600">
                The public course list is being prepared. You can still send a general application.
              </div>
            ) : null}
          </div>
        </section>

        <section id="apply" className="bg-white">
          <div className="mx-auto grid max-w-7xl gap-8 px-4 py-14 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-teal-700">Apply Online</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-normal">Send your application to the admissions office.</h2>
              <p className="mt-4 max-w-xl text-sm leading-7 text-slate-600">
                Applications submitted here are not public. They are sent to the EduCore admin inbox for review, and an administrator can follow
                up by email or phone.
              </p>
              <div className="mt-6 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                Have your contact details ready. If you are unsure which course fits, choose General application and describe your goal.
              </div>
            </div>

            <form
              className="rounded-md border border-slate-200 bg-[#fbfcfc] p-5 shadow-sm"
              onSubmit={form.handleSubmit((values) => applicationMutation.mutate(values))}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={inputLabel}>Full name</label>
                  <Input {...form.register("fullName")} />
                  {form.formState.errors.fullName ? <p className="mt-1 text-xs text-red-700">{form.formState.errors.fullName.message}</p> : null}
                </div>
                <div>
                  <label className={inputLabel}>Email</label>
                  <Input type="email" {...form.register("email")} />
                  {form.formState.errors.email ? <p className="mt-1 text-xs text-red-700">{form.formState.errors.email.message}</p> : null}
                </div>
                <div>
                  <label className={inputLabel}>Phone</label>
                  <Input {...form.register("phone")} />
                </div>
                <div>
                  <label className={inputLabel}>Current education level</label>
                  <Input placeholder="High school, diploma, degree..." {...form.register("educationLevel")} />
                </div>
                <div className="sm:col-span-2">
                  <label className={inputLabel}>Course</label>
                  <select
                    className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                    {...form.register("courseId")}
                  >
                    <option value="">General application</option>
                    {courseOptions.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className={inputLabel}>Message</label>
                  <Textarea rows={5} placeholder="Tell us what you want to study and when you want to start." {...form.register("message")} />
                </div>
              </div>

              {submittedApplication ? (
                <p className="mt-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">
                  Application received for {submittedApplication.courseTitle}. An administrator can now review it.
                </p>
              ) : null}
              {applicationMutation.isError ? (
                <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
                  {applicationMutation.error instanceof Error ? applicationMutation.error.message : "Application could not be sent"}
                </p>
              ) : null}

              <Button className="mt-5 w-full sm:w-auto" disabled={applicationMutation.isPending}>
                <Send size={16} />
                Submit application
              </Button>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}
