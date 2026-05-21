import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Eye, FileQuestion, FileText, Image, Layers, Megaphone, Pencil, Plus, Save, Send, Upload, X } from "lucide-react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Input, Textarea } from "../components/ui/Input";
import { SectionHeader } from "../components/ui/SectionHeader";
import { Table, Td, Th } from "../components/ui/Table";
import { api } from "../services/api";
import type { ApiList, Course } from "../types";

type CmsView = "lessons" | "announcements" | "pages" | "quiz";
type BlockType = "heading" | "paragraph" | "quote" | "link";

interface ContentBlock {
  type: string;
  text?: string;
  url?: string;
}

interface Lesson {
  _id: string;
  courseId: string;
  title: string;
  content: string;
  blocks: ContentBlock[];
  assets: string[];
  order: number;
  published: boolean;
  updatedAt?: string;
}

interface Announcement {
  _id: string;
  courseId?: string;
  title: string;
  body: string;
  audience: string;
  publishedAt: string;
}

interface CmsContentPage {
  _id: string;
  slug: string;
  title: string;
  blocks: ContentBlock[];
  status: "draft" | "published";
  updatedAt?: string;
}

interface QuizQuestion {
  _id: string;
  lessonId: string;
  prompt: string;
  type: "single" | "multiple" | "text";
  options: string[];
  correctAnswers: string[];
  points: number;
}

interface PageDraft {
  slug: string;
  title: string;
  status: "draft" | "published";
  blocks: ContentBlock[];
}

interface QuizDraft {
  lessonId: string;
  prompt: string;
  type: "single" | "multiple" | "text";
  options: string;
  correctAnswers: string;
  points: number;
}

const selectClassName = "h-10 w-full rounded-md border border-border bg-white px-3 text-sm";
const emptyLesson = {
  courseId: "",
  title: "",
  content: "",
  blocks: [] as ContentBlock[],
  assets: [] as string[],
  order: 0,
  published: false
};
const emptyAnnouncement = { courseId: "", title: "", body: "", audience: "all" };
const emptyPage: PageDraft = { slug: "home", title: "", status: "draft", blocks: [] };
const emptyQuiz: QuizDraft = { lessonId: "", prompt: "", type: "single", options: "", correctAnswers: "", points: 1 };

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function blockText(block: ContentBlock) {
  return block.text ?? block.url ?? "";
}

function blockPreview(block: ContentBlock) {
  if (block.type === "heading") return <h3 className="text-lg font-semibold">{block.text}</h3>;
  if (block.type === "quote") return <blockquote className="border-l-4 border-primary pl-3 text-slate-600">{block.text}</blockquote>;
  if (block.type === "link" && block.url) {
    return (
      <a className="text-primary" href={block.url} target="_blank" rel="noreferrer">
        {block.text || block.url}
      </a>
    );
  }
  if ((block.type === "image" || block.type === "file") && block.url) {
    return (
      <a className="text-primary" href={block.url} target="_blank" rel="noreferrer">
        {block.url.split("/").pop()}
      </a>
    );
  }
  return <p className="leading-6 text-slate-700">{block.text}</p>;
}

function StatTile({ title, value, icon: Icon }: { title: string; value: number | string; icon: typeof BookOpen }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">{title}</p>
          <p className="mt-1 text-2xl font-semibold">{value}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-teal-50 text-primary">
          <Icon size={19} />
        </div>
      </CardContent>
    </Card>
  );
}

export function CmsPage() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<CmsView>("lessons");
  const [courseFilter, setCourseFilter] = useState("");
  const [selectedLessonId, setSelectedLessonId] = useState("");
  const [selectedPageSlug, setSelectedPageSlug] = useState("");
  const [lessonDraft, setLessonDraft] = useState(emptyLesson);
  const [announcementDraft, setAnnouncementDraft] = useState(emptyAnnouncement);
  const [pageDraft, setPageDraft] = useState(emptyPage);
  const [quizDraft, setQuizDraft] = useState(emptyQuiz);
  const [blockType, setBlockType] = useState<BlockType>("paragraph");
  const [blockInput, setBlockInput] = useState("");
  const [blockUrl, setBlockUrl] = useState("");
  const [pageBlockType, setPageBlockType] = useState<BlockType>("paragraph");
  const [pageBlockInput, setPageBlockInput] = useState("");
  const [pageBlockUrl, setPageBlockUrl] = useState("");
  const [assetFile, setAssetFile] = useState<File | null>(null);

  const { data: courses } = useQuery({ queryKey: ["courses"], queryFn: () => api.get<ApiList<Course>>("/courses") });
  const lessonPath = courseFilter ? `/cms/lessons?courseId=${encodeURIComponent(courseFilter)}` : "/cms/lessons";
  const announcementPath = courseFilter ? `/cms/announcements?courseId=${encodeURIComponent(courseFilter)}` : "/cms/announcements";
  const { data: lessons } = useQuery({ queryKey: ["lessons", lessonPath], queryFn: () => api.get<{ data: Lesson[] }>(lessonPath) });
  const { data: announcements } = useQuery({
    queryKey: ["announcements", announcementPath],
    queryFn: () => api.get<{ data: Announcement[] }>(announcementPath)
  });
  const { data: pages } = useQuery({ queryKey: ["cms-pages"], queryFn: () => api.get<{ data: CmsContentPage[] }>("/cms/pages") });
  const { data: questions } = useQuery({ queryKey: ["quiz-questions"], queryFn: () => api.get<{ data: QuizQuestion[] }>("/cms/quiz-questions") });

  const courseName = useMemo(() => {
    const names = new Map((courses?.data ?? []).map((course) => [course.id, course.title]));
    return (courseId?: string) => (courseId ? names.get(courseId) ?? "Course" : "Global");
  }, [courses?.data]);
  const selectedLesson = useMemo(() => (lessons?.data ?? []).find((lesson) => lesson._id === selectedLessonId), [lessons?.data, selectedLessonId]);
  const selectedPage = useMemo(() => (pages?.data ?? []).find((page) => page.slug === selectedPageSlug), [pages?.data, selectedPageSlug]);

  useEffect(() => {
    if (!selectedLesson) return;
    setLessonDraft({
      courseId: selectedLesson.courseId,
      title: selectedLesson.title,
      content: selectedLesson.content,
      blocks: selectedLesson.blocks ?? [],
      assets: selectedLesson.assets ?? [],
      order: selectedLesson.order ?? 0,
      published: selectedLesson.published
    });
  }, [selectedLesson]);

  useEffect(() => {
    if (!selectedPage) return;
    setPageDraft({
      slug: selectedPage.slug,
      title: selectedPage.title,
      status: selectedPage.status,
      blocks: selectedPage.blocks ?? []
    });
  }, [selectedPage]);

  const saveLesson = useMutation({
    mutationFn: () => {
      const payload = {
        ...lessonDraft,
        content: lessonDraft.content || lessonDraft.blocks.map(blockText).join("\n\n"),
        order: Number(lessonDraft.order) || 0
      };
      return selectedLessonId ? api.put<Lesson>(`/cms/lessons/${selectedLessonId}`, payload) : api.post<Lesson>("/cms/lessons", payload);
    },
    onSuccess: (lesson) => {
      setSelectedLessonId(lesson._id);
      queryClient.invalidateQueries({ queryKey: ["lessons"] });
    }
  });

  const saveAnnouncement = useMutation({
    mutationFn: () =>
      api.post("/cms/announcements", {
        ...announcementDraft,
        courseId: announcementDraft.courseId || undefined
      }),
    onSuccess: () => {
      setAnnouncementDraft(emptyAnnouncement);
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
    }
  });

  const savePage = useMutation({
    mutationFn: () => {
      const slug = slugify(pageDraft.slug);
      return api.put<CmsContentPage>(`/cms/pages/${slug}`, {
        title: pageDraft.title,
        status: pageDraft.status,
        blocks: pageDraft.blocks
      });
    },
    onSuccess: (page) => {
      setSelectedPageSlug(page.slug);
      setPageDraft({ slug: page.slug, title: page.title, status: page.status, blocks: page.blocks ?? [] });
      queryClient.invalidateQueries({ queryKey: ["cms-pages"] });
    }
  });

  const saveQuiz = useMutation({
    mutationFn: () =>
      api.post("/cms/quiz-questions", {
        lessonId: quizDraft.lessonId,
        prompt: quizDraft.prompt,
        type: quizDraft.type,
        options: quizDraft.options.split("\n").map((item) => item.trim()).filter(Boolean),
        correctAnswers: quizDraft.correctAnswers.split("\n").map((item) => item.trim()).filter(Boolean),
        points: Number(quizDraft.points) || 1
      }),
    onSuccess: () => {
      setQuizDraft(emptyQuiz);
      queryClient.invalidateQueries({ queryKey: ["quiz-questions"] });
    }
  });

  const uploadAsset = useMutation({
    mutationFn: async () => {
      if (!assetFile) return null;
      const form = new FormData();
      form.append("file", assetFile);
      return api.post<{ url: string | null }>("/cms/assets", form);
    },
    onSuccess: (result) => {
      if (result?.url) {
        setLessonDraft((current) => ({
          ...current,
          assets: [...current.assets, result.url!],
          blocks: [...current.blocks, { type: result.url!.match(/\.(png|jpg|jpeg|gif|webp)$/i) ? "image" : "file", url: result.url! }]
        }));
      }
      setAssetFile(null);
    }
  });

  function resetLesson() {
    setSelectedLessonId("");
    setLessonDraft(emptyLesson);
    setBlockInput("");
    setBlockUrl("");
  }

  function addLessonBlock() {
    if (!blockInput.trim() && !blockUrl.trim()) return;
    const block = blockType === "link" ? { type: blockType, text: blockInput.trim(), url: blockUrl.trim() } : { type: blockType, text: blockInput.trim() };
    setLessonDraft((current) => ({ ...current, blocks: [...current.blocks, block] }));
    setBlockInput("");
    setBlockUrl("");
  }

  function addPageBlock() {
    if (!pageBlockInput.trim() && !pageBlockUrl.trim()) return;
    const block = pageBlockType === "link" ? { type: pageBlockType, text: pageBlockInput.trim(), url: pageBlockUrl.trim() } : { type: pageBlockType, text: pageBlockInput.trim() };
    setPageDraft((current) => ({ ...current, blocks: [...current.blocks, block] }));
    setPageBlockInput("");
    setPageBlockUrl("");
  }

  const publishedLessons = (lessons?.data ?? []).filter((lesson) => lesson.published).length;
  const draftLessons = (lessons?.data ?? []).length - publishedLessons;

  return (
    <>
      <SectionHeader title="CMS" description="Publishing workspace for lessons, pages, announcements, assets, and quiz items." />

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <StatTile title="Published Lessons" value={publishedLessons} icon={BookOpen} />
        <StatTile title="Draft Lessons" value={draftLessons} icon={FileText} />
        <StatTile title="Announcements" value={(announcements?.data ?? []).length} icon={Megaphone} />
        <StatTile title="Pages" value={(pages?.data ?? []).length} icon={Layers} />
      </div>

      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2">
          {[
            { id: "lessons", label: "Lessons", icon: BookOpen },
            { id: "announcements", label: "Announcements", icon: Megaphone },
            { id: "pages", label: "Pages", icon: FileText },
            { id: "quiz", label: "Quiz", icon: FileQuestion }
          ].map((item) => {
            const Icon = item.icon;
            return (
              <Button key={item.id} type="button" variant={view === item.id ? "primary" : "outline"} onClick={() => setView(item.id as CmsView)}>
                <Icon size={16} />
                {item.label}
              </Button>
            );
          })}
        </div>
        <select className={`${selectClassName} md:w-80`} value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)}>
          <option value="">All courses</option>
          {(courses?.data ?? []).map((course) => (
            <option key={course.id} value={course.id}>
              {course.title}
            </option>
          ))}
        </select>
      </div>

      {view === "lessons" ? (
        <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>Lesson Library</CardTitle>
                <Button type="button" size="sm" variant="outline" onClick={resetLesson}>
                  <Plus size={14} />
                  New
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {(lessons?.data ?? []).map((lesson) => (
                <button
                  key={lesson._id}
                  type="button"
                  className={`w-full rounded-md border px-3 py-3 text-left text-sm ${selectedLessonId === lesson._id ? "border-primary bg-teal-50" : "border-border bg-white hover:bg-muted"}`}
                  onClick={() => setSelectedLessonId(lesson._id)}
                >
                  <span className="block font-medium">{lesson.title}</span>
                  <span className="mt-1 block text-xs text-slate-500">{courseName(lesson.courseId)}</span>
                  <Badge className="mt-2" tone={lesson.published ? "success" : "warning"}>{lesson.published ? "published" : "draft"}</Badge>
                </button>
              ))}
              {(lessons?.data ?? []).length === 0 ? <p className="text-sm text-slate-500">No lessons found.</p> : null}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{selectedLessonId ? "Edit Lesson" : "Create Lesson"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-[1fr_120px_150px]">
                  <select className={selectClassName} value={lessonDraft.courseId} onChange={(event) => setLessonDraft((current) => ({ ...current, courseId: event.target.value }))}>
                    <option value="">Select course</option>
                    {(courses?.data ?? []).map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.title}
                      </option>
                    ))}
                  </select>
                  <Input type="number" placeholder="Order" value={lessonDraft.order} onChange={(event) => setLessonDraft((current) => ({ ...current, order: Number(event.target.value) }))} />
                  <select className={selectClassName} value={lessonDraft.published ? "published" : "draft"} onChange={(event) => setLessonDraft((current) => ({ ...current, published: event.target.value === "published" }))}>
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                  </select>
                </div>
                <Input placeholder="Lesson title" value={lessonDraft.title} onChange={(event) => setLessonDraft((current) => ({ ...current, title: event.target.value }))} />
                <Textarea placeholder="Summary or fallback lesson body" value={lessonDraft.content} onChange={(event) => setLessonDraft((current) => ({ ...current, content: event.target.value }))} />

                <div className="rounded-md border border-border p-3">
                  <div className="grid gap-2 md:grid-cols-[140px_1fr_1fr_auto]">
                    <select className={selectClassName} value={blockType} onChange={(event) => setBlockType(event.target.value as BlockType)}>
                      <option value="heading">Heading</option>
                      <option value="paragraph">Paragraph</option>
                      <option value="quote">Quote</option>
                      <option value="link">Link</option>
                    </select>
                    <Input placeholder="Block text" value={blockInput} onChange={(event) => setBlockInput(event.target.value)} />
                    <Input placeholder="URL" value={blockUrl} disabled={blockType !== "link"} onChange={(event) => setBlockUrl(event.target.value)} />
                    <Button type="button" variant="outline" onClick={addLessonBlock}>
                      <Plus size={16} />
                      Add
                    </Button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {lessonDraft.blocks.map((block, index) => (
                      <div key={`${block.type}-${index}`} className="flex items-center justify-between gap-3 rounded-md bg-muted p-3 text-sm">
                        <div className="min-w-0">
                          <p className="font-medium capitalize">{block.type}</p>
                          <p className="truncate text-slate-500">{blockText(block)}</p>
                        </div>
                        <button type="button" className="text-slate-500 hover:text-red-600" onClick={() => setLessonDraft((current) => ({ ...current, blocks: current.blocks.filter((_, itemIndex) => itemIndex !== index) }))}>
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-center">
                  <Input type="file" onChange={(event) => setAssetFile(event.target.files?.[0] ?? null)} />
                  <Button type="button" variant="outline" disabled={!assetFile || uploadAsset.isPending} onClick={() => uploadAsset.mutate()}>
                    <Upload size={16} />
                    Upload
                  </Button>
                </div>

                <Button disabled={!lessonDraft.courseId || !lessonDraft.title || saveLesson.isPending} onClick={() => saveLesson.mutate()}>
                  <Save size={16} />
                  Save lesson
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Preview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={lessonDraft.published ? "success" : "warning"}>{lessonDraft.published ? "published" : "draft"}</Badge>
                  <span className="text-sm text-slate-500">{courseName(lessonDraft.courseId)}</span>
                </div>
                <h2 className="text-xl font-semibold">{lessonDraft.title || "Untitled lesson"}</h2>
                {lessonDraft.content ? <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{lessonDraft.content}</p> : null}
                {lessonDraft.blocks.map((block, index) => (
                  <div key={`preview-${index}`} className="text-sm">{blockPreview(block)}</div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}

      {view === "announcements" ? (
        <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Announcement</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input placeholder="Title" value={announcementDraft.title} onChange={(event) => setAnnouncementDraft((current) => ({ ...current, title: event.target.value }))} />
              <Textarea placeholder="Message" value={announcementDraft.body} onChange={(event) => setAnnouncementDraft((current) => ({ ...current, body: event.target.value }))} />
              <select className={selectClassName} value={announcementDraft.courseId} onChange={(event) => setAnnouncementDraft((current) => ({ ...current, courseId: event.target.value }))}>
                <option value="">Global</option>
                {(courses?.data ?? []).map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
              <select className={selectClassName} value={announcementDraft.audience} onChange={(event) => setAnnouncementDraft((current) => ({ ...current, audience: event.target.value }))}>
                <option value="all">All</option>
                <option value="admin">Admins</option>
                <option value="instructor">Instructors</option>
                <option value="student">Students</option>
              </select>
              <Button disabled={!announcementDraft.title || !announcementDraft.body || saveAnnouncement.isPending} onClick={() => saveAnnouncement.mutate()}>
                <Send size={16} />
                Publish
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Announcements</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <thead>
                  <tr>
                    <Th>Title</Th>
                    <Th>Audience</Th>
                    <Th>Scope</Th>
                    <Th>Published</Th>
                  </tr>
                </thead>
                <tbody>
                  {(announcements?.data ?? []).map((item) => (
                    <tr key={item._id}>
                      <Td>
                        <div className="font-medium">{item.title}</div>
                        <div className="max-w-xl text-xs text-slate-500">{item.body}</div>
                      </Td>
                      <Td><Badge tone="info">{item.audience}</Badge></Td>
                      <Td>{courseName(item.courseId)}</Td>
                      <Td>{new Date(item.publishedAt).toLocaleString()}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {view === "pages" ? (
        <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>Pages</CardTitle>
                <Button type="button" size="sm" variant="outline" onClick={() => {
                  setSelectedPageSlug("");
                  setPageDraft(emptyPage);
                }}>
                  <Plus size={14} />
                  New
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {(pages?.data ?? []).map((page) => (
                <button
                  key={page._id}
                  type="button"
                  className={`w-full rounded-md border px-3 py-3 text-left text-sm ${selectedPageSlug === page.slug ? "border-primary bg-teal-50" : "border-border bg-white hover:bg-muted"}`}
                  onClick={() => setSelectedPageSlug(page.slug)}
                >
                  <span className="block font-medium">{page.title}</span>
                  <span className="mt-1 block text-xs text-slate-500">/{page.slug}</span>
                  <Badge className="mt-2" tone={page.status === "published" ? "success" : "warning"}>{page.status}</Badge>
                </button>
              ))}
              {(pages?.data ?? []).length === 0 ? <p className="text-sm text-slate-500">No pages found.</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Page Composer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-[1fr_160px]">
                <Input placeholder="Slug" value={pageDraft.slug} onChange={(event) => setPageDraft((current) => ({ ...current, slug: event.target.value }))} />
                <select className={selectClassName} value={pageDraft.status} onChange={(event) => setPageDraft((current) => ({ ...current, status: event.target.value as "draft" | "published" }))}>
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
              </div>
              <Input placeholder="Page title" value={pageDraft.title} onChange={(event) => setPageDraft((current) => ({ ...current, title: event.target.value }))} />
              <div className="rounded-md border border-border p-3">
                <div className="grid gap-2 md:grid-cols-[140px_1fr_1fr_auto]">
                  <select className={selectClassName} value={pageBlockType} onChange={(event) => setPageBlockType(event.target.value as BlockType)}>
                    <option value="heading">Heading</option>
                    <option value="paragraph">Paragraph</option>
                    <option value="quote">Quote</option>
                    <option value="link">Link</option>
                  </select>
                  <Input placeholder="Block text" value={pageBlockInput} onChange={(event) => setPageBlockInput(event.target.value)} />
                  <Input placeholder="URL" value={pageBlockUrl} disabled={pageBlockType !== "link"} onChange={(event) => setPageBlockUrl(event.target.value)} />
                  <Button type="button" variant="outline" onClick={addPageBlock}>
                    <Plus size={16} />
                    Add
                  </Button>
                </div>
                <div className="mt-3 space-y-2">
                  {pageDraft.blocks.map((block, index) => (
                    <div key={`${block.type}-${index}`} className="flex items-center justify-between gap-3 rounded-md bg-muted p-3 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium capitalize">{block.type}</p>
                        <p className="truncate text-slate-500">{blockText(block)}</p>
                      </div>
                      <button type="button" className="text-slate-500 hover:text-red-600" onClick={() => setPageDraft((current) => ({ ...current, blocks: current.blocks.filter((_, itemIndex) => itemIndex !== index) }))}>
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-md bg-muted p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                  <Eye size={16} />
                  {pageDraft.title || "Untitled page"}
                </div>
                <div className="space-y-3">
                  {pageDraft.blocks.map((block, index) => <div key={`page-preview-${index}`}>{blockPreview(block)}</div>)}
                </div>
              </div>
              <Button disabled={!pageDraft.slug || !pageDraft.title || savePage.isPending} onClick={() => savePage.mutate()}>
                <Save size={16} />
                Save page
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {view === "quiz" ? (
        <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Question Builder</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <select className={selectClassName} value={quizDraft.lessonId} onChange={(event) => setQuizDraft((current) => ({ ...current, lessonId: event.target.value }))}>
                <option value="">Select lesson</option>
                {(lessons?.data ?? []).map((lesson) => (
                  <option key={lesson._id} value={lesson._id}>
                    {lesson.title}
                  </option>
                ))}
              </select>
              <Textarea placeholder="Question prompt" value={quizDraft.prompt} onChange={(event) => setQuizDraft((current) => ({ ...current, prompt: event.target.value }))} />
              <div className="grid gap-3 md:grid-cols-[1fr_120px]">
                <select className={selectClassName} value={quizDraft.type} onChange={(event) => setQuizDraft((current) => ({ ...current, type: event.target.value as "single" | "multiple" | "text" }))}>
                  <option value="single">Single choice</option>
                  <option value="multiple">Multiple choice</option>
                  <option value="text">Text answer</option>
                </select>
                <Input type="number" placeholder="Points" value={quizDraft.points} onChange={(event) => setQuizDraft((current) => ({ ...current, points: Number(event.target.value) }))} />
              </div>
              <Textarea placeholder="Options, one per line" value={quizDraft.options} onChange={(event) => setQuizDraft((current) => ({ ...current, options: event.target.value }))} />
              <Textarea placeholder="Correct answers, one per line" value={quizDraft.correctAnswers} onChange={(event) => setQuizDraft((current) => ({ ...current, correctAnswers: event.target.value }))} />
              <Button disabled={!quizDraft.lessonId || !quizDraft.prompt || saveQuiz.isPending} onClick={() => saveQuiz.mutate()}>
                <Save size={16} />
                Save question
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Questions</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <thead>
                  <tr>
                    <Th>Prompt</Th>
                    <Th>Type</Th>
                    <Th>Points</Th>
                    <Th>Options</Th>
                  </tr>
                </thead>
                <tbody>
                  {(questions?.data ?? []).map((question) => (
                    <tr key={question._id}>
                      <Td className="font-medium">{question.prompt}</Td>
                      <Td><Badge tone="info">{question.type}</Badge></Td>
                      <Td>{question.points}</Td>
                      <Td>{question.options.length}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </>
  );
}
