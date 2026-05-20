import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { BookOpen, FileText } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { SectionHeader } from "../components/ui/SectionHeader";
import { api } from "../services/api";
import type { ApiList, Course } from "../types";

interface Lesson {
  _id: string;
  title: string;
  content: string;
  courseId: string;
}

export function StudentHomePage() {
  const { data: courses } = useQuery({ queryKey: ["courses"], queryFn: () => api.get<ApiList<Course>>("/courses") });
  const { data: lessons } = useQuery({ queryKey: ["lessons"], queryFn: () => api.get<{ data: Lesson[] }>("/cms/lessons") });

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
              {(lessons?.data ?? []).slice(0, 6).map((lesson) => (
                <div key={lesson._id} className="rounded-md bg-muted p-4">
                  <div className="flex items-center gap-2">
                    <FileText size={17} className="text-primary" />
                    <p className="font-medium">{lesson.title}</p>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{lesson.content}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
