import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Badge } from "../components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { SectionHeader } from "../components/ui/SectionHeader";
import { api } from "../services/api";
import type { ClassDay, ClassRecord } from "../types";

interface Announcement {
  _id: string;
  title: string;
  body: string;
  audience: string;
}

export function ContentPage() {
  const [selectedClassId, setSelectedClassId] = useState("");
  const { data: classes } = useQuery({ queryKey: ["classes"], queryFn: () => api.get<{ data: ClassRecord[] }>("/courses/classes/all") });
  const activeClassId = selectedClassId || classes?.data?.[0]?.id || "";
  const { data: days } = useQuery({
    queryKey: ["class-days", activeClassId],
    queryFn: () => api.get<{ data: ClassDay[] }>(`/courses/classes/${activeClassId}/days`),
    enabled: Boolean(activeClassId)
  });
  const { data: announcements } = useQuery({
    queryKey: ["announcements"],
    queryFn: () => api.get<{ data: Announcement[] }>("/cms/announcements")
  });

  return (
    <>
      <SectionHeader title="Course Content" description="Published lessons and announcements for your enrolled courses." />
      <div className="mb-5 max-w-md">
        <select
          className="h-10 w-full rounded-md border border-border bg-white px-3 text-sm"
          value={activeClassId}
          onChange={(event) => setSelectedClassId(event.target.value)}
        >
          {(classes?.data ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.courseTitle} / {item.room}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          {(days?.data ?? []).map((day) => (
            <Card key={day._id}>
              <CardHeader>
                <CardTitle>Day {day.dayNumber}: {day.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-6 text-slate-700">{day.content}</p>
                {day.assets?.length ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {day.assets.map((asset) => (
                      <a key={asset} href={asset} target="_blank" rel="noreferrer" className="rounded-md bg-teal-50 px-3 py-2 text-sm text-primary">
                        {asset.split("/").pop()}
                      </a>
                    ))}
                  </div>
                ) : null}
                {day.blocks?.length ? (
                  <div className="mt-4 space-y-2">
                    {day.blocks.filter((block) => block.text).map((block, index) => (
                      <div key={`${day._id}-${index}`} className="rounded-md bg-muted p-3 text-sm text-slate-700">
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
