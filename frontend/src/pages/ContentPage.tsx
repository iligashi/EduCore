import { useQuery } from "@tanstack/react-query";
import { Badge } from "../components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { SectionHeader } from "../components/ui/SectionHeader";
import { api } from "../services/api";

interface Lesson {
  _id: string;
  title: string;
  content: string;
  courseId: string;
  blocks?: { type: string; text?: string }[];
}

interface Announcement {
  _id: string;
  title: string;
  body: string;
  audience: string;
}

export function ContentPage() {
  const { data: lessons } = useQuery({ queryKey: ["lessons"], queryFn: () => api.get<{ data: Lesson[] }>("/cms/lessons") });
  const { data: announcements } = useQuery({
    queryKey: ["announcements"],
    queryFn: () => api.get<{ data: Announcement[] }>("/cms/announcements")
  });

  return (
    <>
      <SectionHeader title="Course Content" description="Published lessons and announcements for your enrolled courses." />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          {(lessons?.data ?? []).map((lesson) => (
            <Card key={lesson._id}>
              <CardHeader>
                <CardTitle>{lesson.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-6 text-slate-700">{lesson.content}</p>
                {lesson.blocks?.length ? (
                  <div className="mt-4 space-y-2">
                    {lesson.blocks.map((block, index) => (
                      <div key={`${lesson._id}-${index}`} className="rounded-md bg-muted p-3 text-sm text-slate-700">
                        {block.text}
                      </div>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
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
    </>
  );
}

