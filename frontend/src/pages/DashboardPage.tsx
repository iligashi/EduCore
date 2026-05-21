import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, BookOpen, ClipboardCheck, GraduationCap, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "../components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { SectionHeader } from "../components/ui/SectionHeader";
import { StatCard } from "../components/ui/StatCard";
import { Table, Td, Th } from "../components/ui/Table";
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
  riskStudents: {
    studentId: string;
    studentName: string;
    attendanceRate: number;
    averageGrade?: number | null;
    missingSubmissions: number;
  }[];
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
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-amber-600" />
            <CardTitle>Student Risk Detection</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <thead>
              <tr>
                <Th>Student</Th>
                <Th>Attendance</Th>
                <Th>Avg Grade</Th>
                <Th>Missing Work</Th>
                <Th>Risk</Th>
              </tr>
            </thead>
            <tbody>
              {(data?.riskStudents ?? []).map((student) => (
                <tr key={student.studentId}>
                  <Td className="font-medium">{student.studentName}</Td>
                  <Td>{student.attendanceRate}%</Td>
                  <Td>{student.averageGrade ?? "No grades"}</Td>
                  <Td>{student.missingSubmissions}</Td>
                  <Td>
                    <Badge tone={student.attendanceRate < 70 || Number(student.averageGrade ?? 100) < 60 ? "danger" : "warning"}>
                      {student.attendanceRate < 70 ? "attendance" : student.missingSubmissions > 0 ? "missing work" : "grade"}
                    </Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {(data?.riskStudents ?? []).length === 0 ? <p className="text-sm text-slate-500">No at-risk students detected.</p> : null}
        </CardContent>
      </Card>
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
