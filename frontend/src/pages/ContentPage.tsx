import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
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
  const [pageIndex, setPageIndex] = useState(0);
  const { data: classes } = useQuery({ queryKey: ["classes"], queryFn: () => api.get<{ data: ClassRecord[] }>("/courses/classes/all") });
  const activeClassId = selectedClassId || classes?.data?.[0]?.id || "";
  const { data: days } = useQuery({
    queryKey: ["class-days", activeClassId],
    queryFn: () => api.get<{ data: ClassDay[] }>(`/courses/classes/${activeClassId}/days`),
    enabled: Boolean(activeClassId)
  });
  const currentDay = days?.data?.[pageIndex];
  useEffect(() => {
    setPageIndex(0);
  }, [activeClassId]);
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
        <div>
          <div className="mb-3 flex items-center justify-between">
            <button
              className="rounded-md border border-border bg-white px-3 py-2 text-sm disabled:opacity-50"
              disabled={pageIndex <= 0}
              onClick={() => setPageIndex((index) => Math.max(index - 1, 0))}
            >
              Previous
            </button>
            <span className="text-sm text-slate-500">
              Page {Math.min(pageIndex + 1, days?.data?.length ?? 0)} of {days?.data?.length ?? 0}
            </span>
            <button
              className="rounded-md border border-border bg-white px-3 py-2 text-sm disabled:opacity-50"
              disabled={pageIndex >= (days?.data?.length ?? 1) - 1}
              onClick={() => setPageIndex((index) => Math.min(index + 1, (days?.data?.length ?? 1) - 1))}
            >
              Next
            </button>
          </div>
          {currentDay ? (
            <Card className="min-h-[620px] bg-white shadow-soft">
              <CardHeader>
                <CardTitle>Day {currentDay.dayNumber}: {currentDay.title}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-8 lg:grid-cols-2">
                <div className="border-r-0 border-border pr-0 lg:border-r lg:pr-8">
                  <p className="text-base leading-8 text-slate-800">{currentDay.content}</p>
                  {currentDay.blocks?.filter((block) => block.text && block.type !== "asset").map((block, index) => (
                    <div key={`${currentDay._id}-text-${index}`} className="mt-5">
                      {block.type === "heading" ? <h2 className="text-xl font-semibold">{block.text}</h2> : null}
                      {block.type === "quote" ? <blockquote className="border-l-4 border-primary pl-4 text-slate-600">{block.text}</blockquote> : null}
                      {block.type === "paragraph" ? <p className="leading-7 text-slate-700">{block.text}</p> : null}
                      {block.type === "link" && block.url ? <a className="text-primary" href={block.url} target="_blank" rel="noreferrer">{block.text}</a> : null}
                    </div>
                  ))}
                </div>
                <div>
                  <h3 className="mb-3 text-sm font-semibold uppercase text-slate-500">Files and media</h3>
                  <div className="space-y-3">
                    {(currentDay.blocks ?? []).filter((block) => block.url).map((block, index) => (
                      <a key={`${currentDay._id}-asset-${index}`} href={block.url} target="_blank" rel="noreferrer" className="block rounded-md border border-border p-3 text-sm text-primary">
                        {block.url?.split("/").pop()}
                      </a>
                    ))}
                  </div>
                </div>
                {currentDay.assets?.length ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {currentDay.assets.map((asset) => (
                      <a key={asset} href={asset} target="_blank" rel="noreferrer" className="rounded-md bg-teal-50 px-3 py-2 text-sm text-primary">
                        {asset.split("/").pop()}
                      </a>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent>
                <p className="text-sm text-slate-500">No published days are available for this class yet.</p>
              </CardContent>
            </Card>
          )}
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
