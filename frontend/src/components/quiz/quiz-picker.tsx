"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRightIcon, Loader2Icon, LogInIcon, PlayIcon, TimerIcon, TrophyIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSignedIn } from "@/components/site/account-menu";
import { ApiError, publicJson } from "@/lib/api";
import { readMediumCookie, subscribeMedium } from "@/lib/medium";
import { AvailableQuiz, quizHref, startQuiz, targetOf } from "@/lib/quiz";
import type { Medium } from "@/lib/server-api";
import { cn } from "@/lib/utils";

interface PickerChapter {
  id: string;
  number: number;
  title: string;
  href: string;
  quizzes: AvailableQuiz[];
}
interface PickerData {
  quizzes: AvailableQuiz[];
  subjects: { id: string; name: string; nativeName: string | null; quizzes: AvailableQuiz[]; chapters: PickerChapter[] }[];
}
type Loaded<T> = { key: string; data: T | null; error: string | null };

const CLASS_KEY = "cc_quiz_class";
const readSavedClass = () => {
  try {
    return localStorage.getItem(CLASS_KEY);
  } catch {
    return null;
  }
};

// Fetches `path` whenever it changes; `loading` is derived (no setState in the effect body).
function useJson<T>(path: string | null) {
  const [state, setState] = useState<Loaded<T>>({ key: "", data: null, error: null });
  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    publicJson<T>(path)
      .then((data) => !cancelled && setState({ key: path, data, error: null }))
      .catch((err: ApiError) => !cancelled && setState({ key: path, data: null, error: err.message }));
    return () => {
      cancelled = true;
    };
  }, [path]);
  const current = path && state.key === path ? state : null;
  return { data: current?.data ?? null, error: current?.error ?? null, loading: Boolean(path) && !current };
}

const chip = (active: boolean) =>
  cn("inline-flex min-h-11 shrink-0 items-center rounded-xl border px-4 text-sm font-semibold transition", active ? "press-3d border-transparent" : "bg-card hover:bg-accent");

// Home page "Start Quiz": pick a class, see every quiz in it (class tests,
// then each subject's chapter quizzes) and start one. Guests are asked to sign
// in first. Loaded on the first tap (start-quiz.tsx).
export function QuizPicker({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const signedIn = useSignedIn();
  const cookieMedium = useSyncExternalStore(subscribeMedium, readMediumCookie, () => null);
  const [pickedMedium, setPickedMedium] = useState<string | null>(null);
  const [pickedClass, setPickedClass] = useState<string | null>(readSavedClass);
  const [starting, setStarting] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  const mediums = useJson<{ mediums: Medium[] }>(open ? "/api/catalog/mediums" : null);
  const mediumList = mediums.data?.mediums ?? [];
  const medium = pickedMedium ?? (mediumList.some((m) => m.slug === cookieMedium) ? cookieMedium : (mediumList.at(-1)?.slug ?? null));

  const classes = useJson<{ classes: { slug: string; name: string }[] }>(open && medium ? `/api/catalog/mediums/${medium}` : null);
  const classList = classes.data?.classes ?? [];
  const classSlug = classList.some((c) => c.slug === pickedClass) ? pickedClass : null;

  const picker = useJson<PickerData>(open && medium && classSlug ? `/api/catalog/quiz-picker?medium=${medium}&classSlug=${classSlug}` : null);

  const chooseClass = (slug: string) => {
    setPickedClass(slug);
    setStartError(null);
    try {
      localStorage.setItem(CLASS_KEY, slug);
    } catch {
      /* private mode: just don't remember it */
    }
  };

  const start = async (quiz: AvailableQuiz, chapterId?: string) => {
    const key = `${quiz.id}:${chapterId ?? ""}`;
    setStarting(key);
    setStartError(null);
    try {
      const { attempt } = await startQuiz(targetOf(quiz, chapterId));
      router.push(quizHref(attempt.id));
    } catch (err) {
      setStartError((err as ApiError).message);
      setStarting(null);
    }
  };

  const quizRow = ({ quiz, title, sub, chapterId, href }: { quiz: AvailableQuiz; title: string; sub?: string; chapterId?: string; href?: string }) => {
    const key = `${quiz.id}:${chapterId ?? ""}`;
    return (
      <li key={key} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-accent/60">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold" lang="as">
            {title}
          </p>
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            {sub && <span lang="as">{sub}</span>}
            <span className="inline-flex items-center gap-1">
              <TimerIcon className="size-3.5" aria-hidden="true" />
              {quiz.questions} questions · {quiz.secondsPerQuestion}s each
            </span>
            {href && (
              <Link href={href} onClick={() => onOpenChange(false)} className="inline-flex items-center font-medium text-brand-amber-text hover:underline">
                Open chapter <ChevronRightIcon className="size-3.5" />
              </Link>
            )}
          </p>
        </div>
        {signedIn ? (
          <button
            type="button"
            onClick={() => start(quiz, chapterId)}
            disabled={starting !== null}
            className="press-3d inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl px-4 text-sm font-bold disabled:opacity-60"
            aria-label={`${quiz.resumeAttemptId ? "Resume" : "Start"} ${title}`}
          >
            {starting === key ? <Loader2Icon className="size-4 animate-spin" /> : <PlayIcon className="size-4 fill-current" />}
            {quiz.resumeAttemptId ? "Resume" : "Start"}
          </button>
        ) : null}
      </li>
    );
  };

  const data = picker.data;
  const empty = data && data.quizzes.length === 0 && data.subjects.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-4 overflow-hidden sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">Start a quiz</DialogTitle>
          <DialogDescription>Choose your class, then a quiz. Each one starts right away.</DialogDescription>
        </DialogHeader>

        {!signedIn && (
          <Link
            href="/login?next=%2F%23start-quiz"
            onClick={() => onOpenChange(false)}
            className="flex items-center gap-3 rounded-xl bg-accent px-4 py-3 text-[15px] font-semibold text-brand-amber-text"
          >
            <LogInIcon className="size-5 shrink-0" /> Sign in (free) to take a quiz and earn coins
            <ChevronRightIcon className="ml-auto size-5" />
          </Link>
        )}

        <div className="grid gap-2">
          {mediumList.length > 1 && (
            <div role="group" aria-label="Medium" className="scroll-row gap-2 pb-1 sm:flex-wrap">
              {mediumList.map((m) => (
                <button key={m.slug} type="button" aria-pressed={medium === m.slug} onClick={() => setPickedMedium(m.slug)} className={chip(medium === m.slug)}>
                  {m.name}
                </button>
              ))}
            </div>
          )}
          {classes.loading || mediums.loading ? (
            <Loader2Icon className="my-2 size-6 animate-spin text-brand-amber-text" aria-label="Loading classes" />
          ) : (
            <div role="group" aria-label="Class" className="scroll-row gap-2 pb-1 sm:flex-wrap">
              {classList.map((c) => (
                <button key={c.slug} type="button" aria-pressed={classSlug === c.slug} onClick={() => chooseClass(c.slug)} className={chip(classSlug === c.slug)}>
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {startError && (
          <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {startError}
          </p>
        )}

        <div className="-mx-2 min-h-24 flex-1 overflow-y-auto px-2" aria-live="polite" aria-busy={picker.loading}>
          {!classSlug ? (
            <p className="py-6 text-center text-muted-foreground">Pick your class to see its quizzes.</p>
          ) : picker.loading ? (
            <Loader2Icon className="mx-auto my-8 size-8 animate-spin text-brand-amber-text" aria-label="Loading quizzes" />
          ) : picker.error ? (
            <p className="py-6 text-center text-destructive">{picker.error}</p>
          ) : empty ? (
            <p className="py-6 text-center text-muted-foreground">No quizzes for this class yet. Try another class.</p>
          ) : (
            data && (
              <div className="grid gap-4 pb-1">
                {data.quizzes.length > 0 && (
                  <section>
                    <h3 className="mb-1 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-brand-amber-text">
                      <TrophyIcon className="size-4" /> Class tests
                    </h3>
                    <ul className="grid gap-1">
                      {data.quizzes.map((q) => (
                        quizRow({ quiz: q, title: q.title, sub: q.description ?? undefined })
                      ))}
                    </ul>
                  </section>
                )}
                {data.subjects.map((s) => (
                  <section key={s.id}>
                    <h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-brand-amber-text">
                      {s.name}
                      {s.nativeName && (
                        <span lang="as" className="ml-2 font-normal normal-case tracking-normal text-muted-foreground">
                          {s.nativeName}
                        </span>
                      )}
                    </h3>
                    <ul className="grid gap-1">
                      {s.quizzes.map((q) => (
                        quizRow({ quiz: q, title: q.title, sub: "Whole subject" })
                      ))}
                      {s.chapters.flatMap((c) =>
                        c.quizzes.map((q) => (
                          quizRow({
                            quiz: q,
                            title: q.kind === "CHAPTER" ? `Chapter ${c.number}${c.title && !/^chapter\s*\d+$/i.test(c.title) ? `: ${c.title}` : ""}` : q.title,
                            chapterId: c.id,
                            href: c.href,
                          })
                        ))
                      )}
                    </ul>
                  </section>
                ))}
              </div>
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
