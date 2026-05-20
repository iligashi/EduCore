import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Plus } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Input, Textarea } from "../components/ui/Input";
import { SectionHeader } from "../components/ui/SectionHeader";
import { Table, Td, Th } from "../components/ui/Table";
import { api } from "../services/api";
import type { ApiList, Course } from "../types";

interface Lesson {
  _id: string;
  courseId: string;
  title: string;
  content: string;
  published: boolean;
}

interface Announcement {
  _id: string;
  title: string;
  body: string;
  audience: string;
  publishedAt: string;
}

const lessonSchema = z.object({
  courseId: z.string().uuid(),
  title: z.string().min(2),
  content: z.string().min(1),
  published: z.coerce.boolean().default(false)
});

const announcementSchema = z.object({
  courseId: z.string().uuid().optional().or(z.literal("")),
  title: z.string().min(2),
  body: z.string().min(2),
  audience: z.enum(["all", "admin", "instructor", "student"]).default("all")
});

export function CmsPage() {
  const queryClient = useQueryClient();
  const lessonForm = useForm<z.infer<typeof lessonSchema>>({
    resolver: zodResolver(lessonSchema),
    defaultValues: { published: false }
  });
  const announcementForm = useForm<z.infer<typeof announcementSchema>>({
    resolver: zodResolver(announcementSchema),
    defaultValues: { audience: "all" }
  });
  const { data: courses } = useQuery({ queryKey: ["courses"], queryFn: () => api.get<ApiList<Course>>("/courses") });
  const { data: lessons } = useQuery({ queryKey: ["lessons"], queryFn: () => api.get<{ data: Lesson[] }>("/cms/lessons") });
  const { data: announcements } = useQuery({
    queryKey: ["announcements"],
    queryFn: () => api.get<{ data: Announcement[] }>("/cms/announcements")
  });
  const createLesson = useMutation({
    mutationFn: (values: z.infer<typeof lessonSchema>) =>
      api.post("/cms/lessons", {
        ...values,
        blocks: [
          { type: "heading", text: values.title },
          { type: "paragraph", text: values.content }
        ]
      }),
    onSuccess: () => {
      lessonForm.reset({ published: false });
      queryClient.invalidateQueries({ queryKey: ["lessons"] });
    }
  });
  const createAnnouncement = useMutation({
    mutationFn: (values: z.infer<typeof announcementSchema>) =>
      api.post("/cms/announcements", { ...values, courseId: values.courseId || undefined }),
    onSuccess: () => {
      announcementForm.reset({ audience: "all" });
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
    }
  });

  return (
    <>
      <SectionHeader title="CMS" description="Lesson blocks, announcements, page content, assets, and quiz structures." />
      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Create Lesson</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={lessonForm.handleSubmit((values) => createLesson.mutate(values))}>
                <select className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm" {...lessonForm.register("courseId")}>
                  <option value="">Select course</option>
                  {(courses?.data ?? []).map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.title}
                    </option>
                  ))}
                </select>
                <Input placeholder="Lesson title" {...lessonForm.register("title")} />
                <Textarea placeholder="Lesson content" {...lessonForm.register("content")} />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" {...lessonForm.register("published")} />
                  Published
                </label>
                <Button className="w-full" disabled={createLesson.isPending}>
                  <Plus size={16} />
                  Save lesson
                </Button>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Create Announcement</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={announcementForm.handleSubmit((values) => createAnnouncement.mutate(values))}>
                <Input placeholder="Title" {...announcementForm.register("title")} />
                <Textarea placeholder="Message" {...announcementForm.register("body")} />
                <select className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm" {...announcementForm.register("audience")}>
                  <option value="all">All</option>
                  <option value="admin">Admins</option>
                  <option value="instructor">Instructors</option>
                  <option value="student">Students</option>
                </select>
                <Button className="w-full" disabled={createAnnouncement.isPending}>
                  <Megaphone size={16} />
                  Publish announcement
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Lessons</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <thead>
                  <tr>
                    <Th>Title</Th>
                    <Th>Status</Th>
                    <Th>Content</Th>
                  </tr>
                </thead>
                <tbody>
                  {(lessons?.data ?? []).map((lesson) => (
                    <tr key={lesson._id}>
                      <Td className="font-medium">{lesson.title}</Td>
                      <Td>
                        <Badge tone={lesson.published ? "success" : "warning"}>{lesson.published ? "published" : "draft"}</Badge>
                      </Td>
                      <Td>{lesson.content}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Announcements</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {(announcements?.data ?? []).map((item) => (
                  <div key={item._id} className="rounded-md border border-border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium">{item.title}</p>
                      <Badge tone="info">{item.audience}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{item.body}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

