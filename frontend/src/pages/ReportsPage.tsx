import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { SectionHeader } from "../components/ui/SectionHeader";
import { api, API_URL, tokenStore } from "../services/api";

async function downloadExport(entity: string, format: "csv" | "json" | "xlsx") {
  const response = await fetch(`${API_URL}/exports/${entity}?format=${format}`, {
    headers: tokenStore.accessToken ? { Authorization: `Bearer ${tokenStore.accessToken}` } : undefined,
    credentials: "include"
  });
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${entity}.${format}`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ReportsPage() {
  const { data: attendance } = useQuery({
    queryKey: ["attendance-report"],
    queryFn: () => api.get<{ data: { courseTitle: string; studentName: string; status: string; total: number }[] }>("/reports/attendance")
  });
  const { data: performance } = useQuery({
    queryKey: ["performance-report"],
    queryFn: () => api.get<{ data: { studentName: string; courseTitle: string; averageGrade: number }[] }>("/reports/performance")
  });

  return (
    <>
      <SectionHeader
        title="Reports"
        description="Attendance, performance, class analytics, and export workflows."
        action={
          <div className="flex flex-wrap gap-2">
            {(["csv", "json", "xlsx"] as const).map((format) => (
              <Button key={format} variant="outline" size="sm" onClick={() => downloadExport("students", format)}>
                <Download size={15} />
                Students {format.toUpperCase()}
              </Button>
            ))}
          </div>
        }
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Attendance Report</CardTitle>
          </CardHeader>
          <CardContent className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={attendance?.data ?? []}>
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
            <CardTitle>Student Performance</CardTitle>
          </CardHeader>
          <CardContent className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={performance?.data ?? []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="studentName" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="averageGrade" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

