import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCircle, Inbox, Send } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Input, Textarea } from "../components/ui/Input";
import { SectionHeader } from "../components/ui/SectionHeader";
import { useAuth } from "../features/auth/AuthProvider";
import { api } from "../services/api";
import type { NotificationItem } from "../types";

const schema = z.object({
  role: z.enum(["admin", "instructor", "student"]).optional().or(z.literal("")),
  title: z.string().min(2),
  message: z.string().min(2),
  type: z.string().default("system")
});

export function NotificationsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { type: "system" }
  });
  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get<{ data: NotificationItem[] }>("/notifications")
  });
  const createMutation = useMutation({
    mutationFn: (values: z.infer<typeof schema>) => api.post("/notifications", { ...values, role: values.role || undefined }),
    onSuccess: () => {
      form.reset({ type: "system" });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    }
  });
  const markRead = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] })
  });

  if (user?.role === "student") {
    const notifications = data?.data ?? [];
    const unread = notifications.filter((item) => !item.readAt);

    return (
      <>
        <SectionHeader title="Inbox" description="Messages from your classes and school." />
        <div className="grid gap-6 xl:grid-cols-[280px_1fr]">
          <div className="space-y-3">
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-teal-50 text-primary">
                  <Inbox size={20} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-500">Unread</p>
                  <p className="text-2xl font-semibold">{unread.length}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
                  <CheckCircle size={20} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-500">Read</p>
                  <p className="text-2xl font-semibold">{notifications.length - unread.length}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Messages</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {notifications.map((item) => (
                  <div key={item._id} className={`rounded-md border p-4 ${item.readAt ? "border-border bg-white" : "border-primary bg-teal-50"}`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Bell size={16} className="text-primary" />
                          <p className="font-medium">{item.title}</p>
                          <Badge tone={item.readAt ? "neutral" : "info"}>{item.type}</Badge>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-700">{item.message}</p>
                        <p className="mt-2 text-xs text-slate-500">{new Date(item.createdAt).toLocaleString()}</p>
                      </div>
                      {!item.readAt ? (
                        <Button variant="outline" size="sm" disabled={markRead.isPending} onClick={() => markRead.mutate(item._id)}>
                          Mark read
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
                {notifications.length === 0 ? <p className="rounded-md border border-dashed border-border p-5 text-sm text-slate-500">No messages yet.</p> : null}
              </div>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <SectionHeader title="Notifications" description="Realtime assignment alerts, grade updates, announcements, and system messages." />
      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Send Notification</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}>
              <Input placeholder="Title" {...form.register("title")} />
              <Textarea placeholder="Message" {...form.register("message")} />
              <Input placeholder="Type" {...form.register("type")} />
              <select className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm" {...form.register("role")}>
                {user?.role === "admin" ? <option value="">Everyone</option> : null}
                {user?.role === "admin" ? <option value="admin">Admins</option> : null}
                {user?.role === "admin" ? <option value="instructor">Instructors</option> : null}
                <option value="student">Students</option>
              </select>
              <Button className="w-full" disabled={createMutation.isPending}>
                <Send size={16} />
                Send
              </Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Inbox</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(data?.data ?? []).map((item) => (
                <div key={item._id} className="flex flex-col gap-3 rounded-md border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Bell size={16} className="text-primary" />
                      <p className="font-medium">{item.title}</p>
                      <Badge tone={item.readAt ? "neutral" : "info"}>{item.type}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{item.message}</p>
                    <p className="mt-1 text-xs text-slate-500">{new Date(item.createdAt).toLocaleString()}</p>
                  </div>
                  {!item.readAt ? (
                    <Button variant="outline" size="sm" onClick={() => markRead.mutate(item._id)}>
                      Mark read
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
