import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { SectionHeader } from "../components/ui/SectionHeader";
import { api } from "../services/api";

interface SearchResults {
  students: { id: string; fullName: string; email: string }[];
  instructors: { id: string; fullName: string; email: string }[];
  courses: { id: string; title: string; description: string }[];
  assignments: { id: string; title: string; description: string }[];
  lessons: { _id: string; title: string; content: string }[];
  announcements: { _id: string; title: string; body: string }[];
  pages: { _id: string; title: string; slug: string }[];
}

function ResultGroup<T extends { id?: string; _id?: string } & Record<string, unknown>>({
  title,
  items,
  primaryKey,
  secondaryKey
}: {
  title: string;
  items: T[];
  primaryKey: keyof T;
  secondaryKey?: keyof T;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {items.map((item) => (
            <div key={String(item.id ?? item._id)} className="rounded-md bg-muted p-3">
              <p className="font-medium">{String(item[primaryKey] ?? "")}</p>
              {secondaryKey ? <p className="mt-1 text-sm text-slate-600">{String(item[secondaryKey] ?? "")}</p> : null}
            </div>
          ))}
          {items.length === 0 ? <p className="text-sm text-slate-500">No matches</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function SearchPage() {
  const [q, setQ] = useState("");
  const { data } = useQuery({
    queryKey: ["search", q],
    queryFn: () => api.get<SearchResults>(`/search?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length > 1
  });

  return (
    <>
      <SectionHeader title="Search" description="Search students, instructors, courses, lessons, assignments, CMS pages, and announcements." />
      <div className="relative mb-6">
        <Search className="absolute left-3 top-3 text-slate-400" size={18} />
        <Input className="h-12 pl-10" placeholder="Search EduCore" value={q} onChange={(event) => setQ(event.target.value)} />
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <ResultGroup title="Students" items={data?.students ?? []} primaryKey="fullName" secondaryKey="email" />
        <ResultGroup title="Instructors" items={data?.instructors ?? []} primaryKey="fullName" secondaryKey="email" />
        <ResultGroup title="Courses" items={data?.courses ?? []} primaryKey="title" secondaryKey="description" />
        <ResultGroup title="Assignments" items={data?.assignments ?? []} primaryKey="title" secondaryKey="description" />
        <ResultGroup title="Lessons" items={data?.lessons ?? []} primaryKey="title" secondaryKey="content" />
        <ResultGroup title="Announcements" items={data?.announcements ?? []} primaryKey="title" secondaryKey="body" />
      </div>
    </>
  );
}

