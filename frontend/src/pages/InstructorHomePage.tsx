import { useQuery } from "@tanstack/react-query";
import { BookOpen, CalendarCheck, ClipboardCheck, Star } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { SectionHeader } from "../components/ui/SectionHeader";
import { StatCard } from "../components/ui/StatCard";
import { api } from "../services/api";

interface InstructorDashboard {
  totals: {
    courses: number;
    classes: number;
    assignments: number;
    ungradedSubmissions: number;
  };
  attendance: { status: string; total: number }[];
  upcoming: { id: string; title: string; dueDate: string; courseTitle: string }[];
}

export function InstructorHomePage() {
  const { data, isLoading } = useQuery({
    queryKey: ["instructor-dashboard"],
    queryFn: () => api.get<InstructorDashboard>("/reports/instructor-dashboard")
  });

  if (isLoading) return <p className="text-sm text-slate-500">Loading teaching overview...</p>;

  return (
    <>
      <SectionHeader title="Teaching" description="Your courses, classes, assignments, and grading queue." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="My Courses" value={data?.totals.courses ?? 0} icon={BookOpen} />
        <StatCard title="My Classes" value={data?.totals.classes ?? 0} icon={CalendarCheck} />
        <StatCard title="Assignments" value={data?.totals.assignments ?? 0} icon={ClipboardCheck} />
        <StatCard title="To Grade" value={data?.totals.ungradedSubmissions ?? 0} icon={Star} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Attendance In My Classes</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.attendance ?? []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="status" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="total" fill="#0f8b8d" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Assignments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(data?.upcoming ?? []).map((assignment) => (
                <div key={assignment.id} className="rounded-md bg-muted p-3">
                  <p className="font-medium">{assignment.title}</p>
                  <p className="mt-1 text-sm text-slate-600">{assignment.courseTitle}</p>
                  <p className="mt-1 text-xs text-slate-500">{new Date(assignment.dueDate).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

