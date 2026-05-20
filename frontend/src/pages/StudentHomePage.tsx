import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { BookOpen, FileText } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { SectionHeader } from "../components/ui/SectionHeader";
import { api } from "../services/api";
import type { ApiList, ClassDay, ClassRecord, Course } from "../types";

export function StudentHomePage() {
  const { data: courses } = useQuery({ queryKey: ["courses"], queryFn: () => api.get<ApiList<Course>>("/courses") });
  const { data: classes } = useQuery({ queryKey: ["classes"], queryFn: () => api.get<{ data: ClassRecord[] }>("/courses/classes/all") });
  const firstClassId = classes?.data?.[0]?.id ?? "";
  const { data: days } = useQuery({
    queryKey: ["class-days", firstClassId],
    queryFn: () => api.get<{ data: ClassDay[] }>(`/courses/classes/${firstClassId}/days`),
    enabled: Boolean(firstClassId)
  });

  return (
    <>
      <SectionHeader
        title="My Courses"
        description="Your enrolled courses and published learning content."
        action={
          <Link to="/content">
            <Button variant="outline">Open content</Button>
          </Link>
        }
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Courses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(courses?.data ?? []).map((course) => (
                <div key={course.id} className="rounded-md border border-border p-4">
                  <div className="flex items-center gap-2">
                    <BookOpen size={17} className="text-primary" />
                    <p className="font-medium">{course.title}</p>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{course.description}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Published Content</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(days?.data ?? []).slice(0, 6).map((day) => (
                <div key={day._id} className="rounded-md bg-muted p-4">
                  <div className="flex items-center gap-2">
                    <FileText size={17} className="text-primary" />
                    <p className="font-medium">Day {day.dayNumber}: {day.title}</p>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{day.content}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
