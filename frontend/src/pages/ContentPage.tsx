import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, CalendarDays, ChevronLeft, ChevronRight, FileText, Link as LinkIcon, Megaphone } from "lucide-react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { SectionHeader } from "../components/ui/SectionHeader";
import { api } from "../services/api";
import type { ClassDay, ClassRecord } from "../types";
import { cn } from "../utils/cn";

interface Announcement {
  _id: string;
  title: string;
  body: string;
  audience: string;
}

function blockText(block: { type: string; text?: string; url?: string }, index: number) {
  if (block.type === "heading") return <h2 key={index} className="text-xl font-semibold text-slate-950">{block.text}</h2>;
  if (block.type === "quote") {
    return (
      <blockquote key={index} className="border-l-4 border-primary pl-4 text-base leading-7 text-slate-700">
        {block.text}
      </blockquote>
    );
  }
  if (block.type === "link" && block.url) {
    return (
      <a key={index} className="inline-flex items-center gap-2 text-sm font-medium text-primary" href={block.url} target="_blank" rel="noreferrer">
        <LinkIcon size={16} />
        {block.text || block.url}
      </a>
    );
  }
  if (block.text) return <p key={index} className="text-base leading-8 text-slate-700">{block.text}</p>;
  return null;
}

export function ContentPage() {
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedDayId, setSelectedDayId] = useState("");
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

  const currentDay = useMemo(
    () => (days?.data ?? []).find((day) => day._id === selectedDayId) ?? days?.data?.[0],
    [days?.data, selectedDayId]
  );
  const activeClass = (classes?.data ?? []).find((item) => item.id === activeClassId);
  const lessonIndex = Math.max(0, (days?.data ?? []).findIndex((day) => day._id === currentDay?._id));

  useEffect(() => {
    setSelectedDayId("");
  }, [activeClassId]);

  function moveLesson(direction: -1 | 1) {
    const list = days?.data ?? [];
    const next = list[lessonIndex + direction];
    if (next) setSelectedDayId(next._id);
  }

  return (
    <>
      <SectionHeader title="Lessons" description="Read your published class content." />

      <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(classes?.data ?? []).map((item) => (
          <button
            key={item.id}
            type="button"
            className={cn(
              "rounded-md border p-4 text-left transition hover:border-primary hover:bg-white",
              activeClassId === item.id ? "border-primary bg-white shadow-soft" : "border-border bg-white"
            )}
            onClick={() => setSelectedClassId(item.id)}
          >
            <div className="flex items-center gap-2">
              <BookOpen size={17} className="text-primary" />
              <p className="font-medium">{item.courseTitle}</p>
            </div>
            <p className="mt-2 text-sm text-slate-600">{item.room}</p>
          </button>
        ))}
      </div>

      {(classes?.data ?? []).length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-sm text-slate-500">No enrolled classes yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[300px_1fr]">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Lesson List</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(days?.data ?? []).map((day) => (
                  <button
                    key={day._id}
                    type="button"
                    className={cn(
                      "w-full rounded-md border p-3 text-left transition hover:border-primary",
                      currentDay?._id === day._id ? "border-primary bg-teal-50" : "border-border bg-white"
                    )}
                    onClick={() => setSelectedDayId(day._id)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold uppercase text-slate-500">Day {day.dayNumber}</span>
                      <FileText size={15} className="text-primary" />
                    </div>
                    <p className="mt-1 font-medium">{day.title}</p>
                  </button>
                ))}
                {(days?.data ?? []).length === 0 ? <p className="text-sm text-slate-500">No published lessons yet.</p> : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Announcements</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(announcements?.data ?? []).slice(0, 4).map((item) => (
                  <div key={item._id} className="rounded-md border border-border p-3">
                    <div className="flex items-center gap-2">
                      <Megaphone size={15} className="text-primary" />
                      <p className="font-medium">{item.title}</p>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{item.body}</p>
                  </div>
                ))}
                {(announcements?.data ?? []).length === 0 ? <p className="text-sm text-slate-500">No announcements right now.</p> : null}
              </CardContent>
            </Card>
          </div>

          <Card className="min-h-[520px]">
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>{currentDay ? currentDay.title : "Lesson"}</CardTitle>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                    {activeClass ? (
                      <>
                        <Badge tone="info">{activeClass.courseTitle}</Badge>
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays size={14} />
                          {activeClass.room}
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={lessonIndex <= 0} onClick={() => moveLesson(-1)}>
                    <ChevronLeft size={16} />
                    Previous
                  </Button>
                  <Button type="button" variant="outline" size="sm" disabled={lessonIndex >= (days?.data?.length ?? 1) - 1} onClick={() => moveLesson(1)}>
                    Next
                    <ChevronRight size={16} />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {currentDay ? (
                <div className="space-y-6">
                  {currentDay.content ? <p className="text-base leading-8 text-slate-800">{currentDay.content}</p> : null}
                  {(currentDay.blocks ?? []).map((block, index) => blockText(block, index))}

                  {(currentDay.assets?.length ?? 0) > 0 ? (
                    <div className="border-t border-border pt-5">
                      <p className="text-xs font-semibold uppercase text-slate-500">Files</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {currentDay.assets.map((asset) => (
                          <a key={asset} href={asset} target="_blank" rel="noreferrer" className="rounded-md border border-border px-3 py-2 text-sm font-medium text-primary">
                            {asset.split("/").pop()}
                          </a>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-slate-500">No lesson selected.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
