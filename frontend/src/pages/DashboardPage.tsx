import { useQuery } from "@tanstack/react-query";
import { BookOpen, ClipboardCheck, GraduationCap, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { SectionHeader } from "../components/ui/SectionHeader";
import { StatCard } from "../components/ui/StatCard";
import { api } from "../services/api";

interface Dashboard {
  totals: {
    students: number;
    instructors: number;
    courses: number;
    assignments: number;
  };
  attendance: { status: string; total: number }[];
  performance: { courseTitle: string; averageGrade: number }[];
  recentActivity: { _id: string; action: string; entity: string; createdAt: string }[];
}

export function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get<Dashboard>("/reports/dashboard")
  });

  if (isLoading) return <p className="text-sm text-slate-500">Loading dashboard...</p>;

  return (
    <>
      <SectionHeader title="Dashboard" description="Operational overview for LMS and DMS activity." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Students" value={data?.totals.students ?? 0} icon={Users} detail="Managed learner records" />
        <StatCard title="Instructors" value={data?.totals.instructors ?? 0} icon={GraduationCap} detail="Teaching staff profiles" />
        <StatCard title="Courses" value={data?.totals.courses ?? 0} icon={BookOpen} detail="LMS course catalog" />
        <StatCard title="Assignments" value={data?.totals.assignments ?? 0} icon={ClipboardCheck} detail="Active assessment items" />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Attendance Statistics</CardTitle>
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
            <CardTitle>Course Performance</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.performance ?? []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="courseTitle" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="averageGrade" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {(data?.recentActivity ?? []).map((activity) => (
              <div key={activity._id} className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
                <span>
                  {activity.action} / {activity.entity}
                </span>
                <span className="text-xs text-slate-500">{new Date(activity.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  );
}

