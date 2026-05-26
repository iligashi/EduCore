import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BrainCircuit, CheckCircle2, Clock3, Play, Radio, RefreshCw, Sparkles, Trophy, Users } from "lucide-react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { SectionHeader } from "../components/ui/SectionHeader";
import { Table, Td, Th } from "../components/ui/Table";
import { useAuth } from "../features/auth/AuthProvider";
import { api } from "../services/api";
import type { ClassDay, ClassRecord, QuizAttempt, QuizQuestion, QuizSession } from "../types";
import { cn } from "../utils/cn";

type QuizAnswerInput = { questionId: string; selectedOption: string };

const optionStyles = [
  "border-blue-200 bg-blue-600 text-white hover:bg-blue-700",
  "border-rose-200 bg-rose-600 text-white hover:bg-rose-700",
  "border-emerald-200 bg-emerald-600 text-white hover:bg-emerald-700",
  "border-amber-200 bg-amber-500 text-slate-950 hover:bg-amber-600"
];

function classLabel(item: Pick<ClassRecord, "courseTitle" | "room">) {
  return `${item.courseTitle} / ${item.room}`;
}

function dayLabel(day: ClassDay) {
  return `Day ${day.dayNumber}: ${day.title}`;
}

function formatDateTime(value?: string) {
  return value ? new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";
}

function scoreLabel(attempt?: QuizAttempt | null) {
  if (!attempt || attempt.status !== "submitted") return "Not submitted";
  return `${attempt.score}/${attempt.total}`;
}

function InstructorQuizPanel() {
  const queryClient = useQueryClient();
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedDayId, setSelectedDayId] = useState("");
  const [questionCount, setQuestionCount] = useState(5);
  const [timeLimitSeconds, setTimeLimitSeconds] = useState(20);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  const { data: classes } = useQuery({
    queryKey: ["classes"],
    queryFn: () => api.get<{ data: ClassRecord[] }>("/courses/classes/all")
  });
  const { data: days } = useQuery({
    queryKey: ["class-days", selectedClassId],
    queryFn: () => api.get<{ data: ClassDay[] }>(`/courses/classes/${selectedClassId}/days`),
    enabled: Boolean(selectedClassId)
  });
  const { data: questions } = useQuery({
    queryKey: ["quiz-questions", selectedDayId],
    queryFn: () => api.get<{ data: QuizQuestion[] }>(`/quizzes/questions?dayId=${selectedDayId}`),
    enabled: Boolean(selectedDayId)
  });
  const { data: sessions } = useQuery({
    queryKey: ["quiz-sessions"],
    queryFn: () => api.get<{ data: QuizSession[] }>("/quizzes/sessions")
  });
  const { data: results } = useQuery({
    queryKey: ["quiz-results", selectedSessionId],
    queryFn: () => api.get<{ session: QuizSession; attempts: QuizAttempt[] }>(`/quizzes/sessions/${selectedSessionId}/results`),
    enabled: Boolean(selectedSessionId)
  });

  useEffect(() => {
    if (!selectedClassId && classes?.data?.[0]) setSelectedClassId(classes.data[0].id);
  }, [classes?.data, selectedClassId]);

  useEffect(() => {
    if (days?.data?.[0]) setSelectedDayId(days.data[0]._id);
    else setSelectedDayId("");
  }, [days?.data, selectedClassId]);

  const selectedClass = (classes?.data ?? []).find((item) => item.id === selectedClassId);
  const selectedDay = (days?.data ?? []).find((day) => day._id === selectedDayId);
  const dayQuestions = questions?.data ?? [];
  const filteredSessions = (sessions?.data ?? []).filter((session) => !selectedDayId || session.dayId === selectedDayId);

  const generateQuiz = useMutation({
    mutationFn: () => api.post<{ data: QuizQuestion[] }>("/quizzes/generate", { dayId: selectedDayId, count: questionCount, timeLimitSeconds }),
    onMutate: () => {
      setActionError("");
      setActionMessage("");
    },
    onSuccess: (result) => {
      setActionMessage(`${result.data.length} quiz questions generated for this lesson.`);
      queryClient.invalidateQueries({ queryKey: ["quiz-questions", selectedDayId] });
    },
    onError: (error) => setActionError(error instanceof Error ? error.message : "Quiz questions could not be generated")
  });

  const startQuiz = useMutation({
    mutationFn: () =>
      api.post<QuizSession>("/quizzes/start", {
        dayId: selectedDayId,
        questionIds: dayQuestions.map((question) => question._id),
        timeLimitSeconds
      }),
    onMutate: () => {
      setActionError("");
      setActionMessage("");
    },
    onSuccess: (session) => {
      setActionMessage(`Live quiz started for ${session.participantCount} present student${session.participantCount === 1 ? "" : "s"}.`);
      setSelectedSessionId(session._id);
      queryClient.invalidateQueries({ queryKey: ["quiz-sessions"] });
    },
    onError: (error) => setActionError(error instanceof Error ? error.message : "Live quiz could not be started")
  });

  const closeQuiz = useMutation({
    mutationFn: (sessionId: string) => api.patch<QuizSession>(`/quizzes/sessions/${sessionId}/close`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quiz-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["quiz-results", selectedSessionId] });
    }
  });

  return (
    <>
      <SectionHeader title="Live Quizzes" description="Generate lesson questions, start a timed class quiz, and review student results." />
      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Class</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(classes?.data ?? []).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={cn(
                    "w-full rounded-md border px-3 py-3 text-left text-sm transition",
                    selectedClassId === item.id ? "border-primary bg-teal-50" : "border-border bg-white hover:bg-muted"
                  )}
                  onClick={() => {
                    setSelectedClassId(item.id);
                    setSelectedSessionId("");
                  }}
                >
                  <span className="block font-medium">{classLabel(item)}</span>
                  {item.instructorName ? <span className="mt-1 block text-xs text-slate-500">{item.instructorName}</span> : null}
                </button>
              ))}
              {(classes?.data ?? []).length === 0 ? <p className="text-sm text-slate-500">No assigned classes.</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Lesson Day</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(days?.data ?? []).map((day) => (
                <button
                  key={day._id}
                  type="button"
                  className={cn(
                    "w-full rounded-md border px-3 py-3 text-left text-sm transition",
                    selectedDayId === day._id ? "border-primary bg-teal-50" : "border-border bg-white hover:bg-muted"
                  )}
                  onClick={() => {
                    setSelectedDayId(day._id);
                    setSelectedSessionId("");
                  }}
                >
                  <span className="block font-medium">{dayLabel(day)}</span>
                  <span className="mt-1 block text-xs text-slate-500">{day.published ? "Published" : "Draft"}</span>
                </button>
              ))}
              {selectedClassId && (days?.data ?? []).length === 0 ? <p className="text-sm text-slate-500">No lesson days for this class.</p> : null}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <CardTitle>{selectedDay ? dayLabel(selectedDay) : "Quiz Builder"}</CardTitle>
                  {selectedClass ? <p className="mt-1 text-sm text-slate-500">{classLabel(selectedClass)}</p> : null}
                </div>
                <div className="grid gap-2 sm:grid-cols-[110px_110px_auto_auto]">
                  <Input type="number" min={3} max={10} value={questionCount} onChange={(event) => setQuestionCount(Number(event.target.value))} title="Question count" />
                  <Input type="number" min={10} max={90} value={timeLimitSeconds} onChange={(event) => setTimeLimitSeconds(Number(event.target.value))} title="Seconds per question" />
                  <Button type="button" variant="outline" disabled={!selectedDayId || generateQuiz.isPending} onClick={() => generateQuiz.mutate()}>
                    <Sparkles size={16} />
                    Generate
                  </Button>
                  <Button type="button" disabled={!selectedDayId || dayQuestions.length === 0 || startQuiz.isPending} onClick={() => startQuiz.mutate()}>
                    <Radio size={16} />
                    Start live
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {actionError ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{actionError}</p> : null}
              {actionMessage ? <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{actionMessage}</p> : null}

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-md bg-slate-100 p-3">
                  <p className="text-xs font-semibold uppercase text-slate-500">Questions</p>
                  <p className="mt-1 text-2xl font-semibold">{dayQuestions.length}</p>
                </div>
                <div className="rounded-md bg-teal-50 p-3 text-teal-800">
                  <p className="text-xs font-semibold uppercase">Timer</p>
                  <p className="mt-1 text-2xl font-semibold">{timeLimitSeconds}s</p>
                </div>
                <div className="rounded-md bg-indigo-50 p-3 text-indigo-800">
                  <p className="text-xs font-semibold uppercase">Mode</p>
                  <p className="mt-1 text-2xl font-semibold">Live</p>
                </div>
              </div>

              <div className="space-y-3">
                {dayQuestions.map((question, index) => (
                  <div key={question._id} className="rounded-md border border-border p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase text-slate-500">Question {index + 1}</p>
                      <Badge tone="info">{question.timeLimitSeconds ?? timeLimitSeconds}s</Badge>
                    </div>
                    <p className="font-semibold text-slate-950">{question.prompt}</p>
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {question.options.map((option) => (
                        <div
                          key={option}
                          className={cn(
                            "rounded-md border px-3 py-2 text-sm",
                            question.correctAnswers.includes(option) ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-border bg-slate-50 text-slate-700"
                          )}
                        >
                          {option}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {selectedDayId && dayQuestions.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border p-8 text-center">
                    <BrainCircuit className="mx-auto text-slate-400" size={34} />
                    <p className="mt-3 font-medium">No questions generated yet.</p>
                    <p className="mt-1 text-sm text-slate-500">Use Generate to create four-answer questions from this lesson.</p>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Live Sessions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 lg:grid-cols-2">
                {filteredSessions.map((session) => (
                  <button
                    key={session._id}
                    type="button"
                    className={cn(
                      "rounded-md border p-4 text-left transition hover:border-primary",
                      selectedSessionId === session._id ? "border-primary bg-teal-50" : "border-border bg-white"
                    )}
                    onClick={() => setSelectedSessionId(session._id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{session.dayTitle}</p>
                        <p className="mt-1 text-sm text-slate-500">{formatDateTime(session.startedAt)}</p>
                      </div>
                      <Badge tone={session.status === "open" ? "success" : "neutral"}>{session.status}</Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge tone="info">{session.participantCount} present</Badge>
                      <Badge tone="neutral">{session.submittedCount ?? 0} submitted</Badge>
                      <Badge tone="warning">{session.questions.length} questions</Badge>
                    </div>
                  </button>
                ))}
              </div>
              {filteredSessions.length === 0 ? <p className="text-sm text-slate-500">No live sessions for this lesson yet.</p> : null}

              {selectedSessionId ? (
                <div className="rounded-md border border-border p-4">
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold">Results</p>
                      <p className="text-sm text-slate-500">{results?.attempts.length ?? 0} attempts received</p>
                    </div>
                    <Button type="button" variant="outline" size="sm" disabled={closeQuiz.isPending} onClick={() => closeQuiz.mutate(selectedSessionId)}>
                      <CheckCircle2 size={15} />
                      Close quiz
                    </Button>
                  </div>
                  <Table>
                    <thead>
                      <tr>
                        <Th>Student</Th>
                        <Th>Status</Th>
                        <Th>Score</Th>
                        <Th>Submitted</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {(results?.attempts ?? []).map((attempt) => (
                        <tr key={attempt._id}>
                          <Td>{attempt.studentName}</Td>
                          <Td>
                            <Badge tone={attempt.status === "submitted" ? "success" : "warning"}>{attempt.status}</Badge>
                          </Td>
                          <Td>{scoreLabel(attempt)}</Td>
                          <Td>{attempt.submittedAt ? formatDateTime(attempt.submittedAt) : "-"}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                  {(results?.attempts ?? []).length === 0 ? <p className="mt-3 text-sm text-slate-500">No student has accepted or submitted this quiz yet.</p> : null}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function QuizPlayer({
  session,
  isSubmitting,
  onSubmit
}: {
  session: QuizSession;
  isSubmitting: boolean;
  onSubmit: (answers: QuizAnswerInput[]) => void;
}) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState(session.questions[0]?.timeLimitSeconds ?? session.timeLimitSeconds);
  const [advancing, setAdvancing] = useState(false);
  const current = session.questions[index];
  const selectedOption = current ? answers[current.id] : "";
  const totalTime = current?.timeLimitSeconds ?? session.timeLimitSeconds;
  const progress = totalTime ? Math.max(0, Math.min(100, (timeLeft / totalTime) * 100)) : 0;

  useEffect(() => {
    setIndex(0);
    setAnswers({});
    setAdvancing(false);
  }, [session._id]);

  useEffect(() => {
    if (!current) return;
    setTimeLeft(current.timeLimitSeconds || session.timeLimitSeconds);
    setAdvancing(false);
  }, [current, session.timeLimitSeconds]);

  function submitFrom(answerMap: Record<string, string>) {
    onSubmit(session.questions.map((question) => ({ questionId: question.id, selectedOption: answerMap[question.id] ?? "" })));
  }

  function advance(answerMap = answers) {
    if (advancing || isSubmitting) return;
    setAdvancing(true);
    if (index >= session.questions.length - 1) {
      submitFrom(answerMap);
      return;
    }
    window.setTimeout(() => setIndex((currentIndex) => currentIndex + 1), 250);
  }

  useEffect(() => {
    if (!current || advancing || isSubmitting) return undefined;
    if (timeLeft <= 0) {
      const timeout = window.setTimeout(() => advance(), 250);
      return () => window.clearTimeout(timeout);
    }

    const timeout = window.setTimeout(() => setTimeLeft((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timeout);
  });

  if (!current) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-slate-500">This quiz has no questions.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-950 text-white shadow-soft">
      <div className="bg-slate-900 px-5 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-slate-300">{session.courseTitle}</p>
            <h2 className="mt-1 text-xl font-semibold tracking-normal">{session.dayTitle}</h2>
          </div>
          <div className="flex items-center gap-2 rounded-md bg-white/10 px-3 py-2">
            <Clock3 size={18} />
            <span className="text-lg font-semibold tabular-nums">{timeLeft}s</span>
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-amber-400 transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="p-5 sm:p-7">
        <div className="mb-5 flex flex-wrap items-center gap-2 text-sm text-slate-300">
          <Badge tone="info">Question {index + 1} of {session.questions.length}</Badge>
          <Badge tone="neutral">{current.points} point{current.points === 1 ? "" : "s"}</Badge>
        </div>

        <p className="min-h-24 text-2xl font-semibold leading-snug tracking-normal sm:text-3xl">{current.prompt}</p>

        <div className="mt-7 grid gap-3 md:grid-cols-2">
          {current.options.slice(0, 4).map((option, optionIndex) => {
            const selected = selectedOption === option;
            return (
              <button
                key={option}
                type="button"
                disabled={Boolean(selectedOption) || isSubmitting}
                className={cn(
                  "min-h-24 rounded-md border-2 p-4 text-left text-base font-semibold shadow-sm transition disabled:cursor-default",
                  optionStyles[optionIndex],
                  selected ? "scale-[0.99] ring-4 ring-white/80" : "hover:-translate-y-0.5",
                  selectedOption && !selected ? "opacity-55" : ""
                )}
                onClick={() => {
                  const nextAnswers = { ...answers, [current.id]: option };
                  setAnswers(nextAnswers);
                  window.setTimeout(() => advance(nextAnswers), 350);
                }}
              >
                <span className="mb-2 block text-xs uppercase opacity-80">Answer {optionIndex + 1}</span>
                {option}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StudentQuizPanel() {
  const queryClient = useQueryClient();
  const [activeSession, setActiveSession] = useState<QuizSession | null>(null);
  const [finishedAttempt, setFinishedAttempt] = useState<QuizAttempt | null>(null);
  const [actionError, setActionError] = useState("");

  const { data: available, isFetching } = useQuery({
    queryKey: ["student-quiz-sessions"],
    queryFn: () => api.get<{ data: QuizSession[] }>("/quizzes/student/available"),
    refetchInterval: 15000
  });

  const acceptQuiz = useMutation({
    mutationFn: (session: QuizSession) => api.post<{ session: QuizSession; attempt: QuizAttempt }>(`/quizzes/sessions/${session._id}/accept`),
    onMutate: () => {
      setActionError("");
      setFinishedAttempt(null);
    },
    onSuccess: (result) => {
      setActiveSession(result.session);
      queryClient.invalidateQueries({ queryKey: ["student-quiz-sessions"] });
    },
    onError: (error) => setActionError(error instanceof Error ? error.message : "Quiz could not be accepted")
  });

  const submitQuiz = useMutation({
    mutationFn: ({ sessionId, answers }: { sessionId: string; answers: QuizAnswerInput[] }) =>
      api.post<QuizAttempt>(`/quizzes/sessions/${sessionId}/submit`, { answers }),
    onMutate: () => setActionError(""),
    onSuccess: (attempt) => {
      setFinishedAttempt(attempt);
      setActiveSession(null);
      queryClient.invalidateQueries({ queryKey: ["student-quiz-sessions"] });
    },
    onError: (error) => setActionError(error instanceof Error ? error.message : "Quiz could not be submitted")
  });

  const sessions = available?.data ?? [];
  const openSessions = sessions.filter((session) => session.attempt?.status !== "submitted");
  const submittedSessions = sessions.filter((session) => session.attempt?.status === "submitted");

  if (activeSession) {
    return (
      <>
        <SectionHeader title="Live Quiz" description="Answer each question before the timer runs out." />
        {actionError ? <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{actionError}</p> : null}
        <QuizPlayer
          session={activeSession}
          isSubmitting={submitQuiz.isPending}
          onSubmit={(answers) => submitQuiz.mutate({ sessionId: activeSession._id, answers })}
        />
      </>
    );
  }

  return (
    <>
      <SectionHeader
        title="Quizzes"
        description="Join live class quizzes when your instructor starts them."
        action={
          <Button type="button" variant="outline" size="sm" disabled={isFetching} onClick={() => queryClient.invalidateQueries({ queryKey: ["student-quiz-sessions"] })}>
            <RefreshCw size={15} />
            Refresh
          </Button>
        }
      />
      {actionError ? <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{actionError}</p> : null}
      {finishedAttempt ? (
        <div className="mb-5 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
          <div className="flex items-center gap-2 font-semibold">
            <Trophy size={18} />
            Quiz submitted: {finishedAttempt.score}/{finishedAttempt.total}
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle>Available Live Quizzes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {openSessions.map((session) => (
              <div key={session._id} className="rounded-md border border-border p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="success">Live</Badge>
                      <Badge tone="info">{session.questions.length} questions</Badge>
                    </div>
                    <p className="mt-3 text-lg font-semibold">{session.dayTitle}</p>
                    <p className="mt-1 text-sm text-slate-600">{session.courseTitle} / {session.room}</p>
                    <p className="mt-1 text-xs text-slate-500">Started {formatDateTime(session.startedAt)}</p>
                  </div>
                  {session.attempt?.status === "accepted" ? (
                    <Button type="button" onClick={() => setActiveSession(session)}>
                      <Play size={16} />
                      Continue
                    </Button>
                  ) : (
                    <Button type="button" disabled={acceptQuiz.isPending} onClick={() => acceptQuiz.mutate(session)}>
                      <Play size={16} />
                      Accept quiz
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {openSessions.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-8 text-center">
                <Radio className="mx-auto text-slate-400" size={34} />
                <p className="mt-3 font-medium">No live quiz is waiting right now.</p>
                <p className="mt-1 text-sm text-slate-500">When your instructor starts one for a day where you are present, it appears here.</p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Completed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {submittedSessions.map((session) => (
              <div key={session._id} className="rounded-md border border-border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{session.dayTitle}</p>
                    <p className="mt-1 text-sm text-slate-500">{session.courseTitle}</p>
                  </div>
                  <Badge tone="success">{scoreLabel(session.attempt)}</Badge>
                </div>
              </div>
            ))}
            {submittedSessions.length === 0 ? <p className="text-sm text-slate-500">No completed quizzes yet.</p> : null}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export function QuizzesPage() {
  const { user } = useAuth();
  return user?.role === "student" ? <StudentQuizPanel /> : <InstructorQuizPanel />;
}
