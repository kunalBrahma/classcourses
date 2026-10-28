"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { CheckIcon, ClockIcon, Loader2Icon, PauseIcon, PlayIcon, RotateCwIcon, TimerIcon, TrophyIcon, XIcon } from "lucide-react";
import { Coin3D } from "@/components/kit/coin";
import { announceCoinsChanged } from "@/components/site/account-menu";
import { ApiError, apiJson } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { AnswerResult, Attempt, attemptLabel, chapterHrefOf, isFinished, OpenQuestion, pauseOnLeave, quizHref, ReviewItem, startQuiz } from "@/lib/quiz";
import { cn } from "@/lib/utils";

const LETTERS = "ABCDEF";

type CoinRule = "firstPassPerChapter" | "firstPassPerChapterPerDay" | "everyPass";
type Feedback = { result: AnswerResult; chosen: number | null; question: OpenQuestion };
// The open question with its deadline on this device's clock (from the
// server's remainingMs, so a wrong phone clock doesn't matter).
type Live = { question: OpenQuestion; deadlineAt: number };

const liveOf = (a: Attempt): Live | null => (a.question ? { question: a.question, deadlineAt: Date.now() + a.question.remainingMs } : null);

// The quiz itself. Every rule is enforced by the server; this screen follows
// the attempt's state: rules → question (timed) → feedback → … → result.
export function QuizRunner({ coinRule }: { coinRule: CoinRule }) {
  const { attemptId } = useParams<{ attemptId: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [leftMidQuestion, setLeftMidQuestion] = useState(false);

  // Latest values for the page-leave handlers.
  const state = useRef({ attempt, live });
  useEffect(() => {
    state.current = { attempt, live };
  }, [attempt, live]);

  const apply = useCallback((a: Attempt) => {
    setAttempt(a);
    setLive(liveOf(a));
  }, []);

  const load = useCallback(() => {
    apiJson<{ attempt: Attempt }>(`/api/quiz/attempts/${attemptId}`)
      .then(({ attempt }) => {
        setError(null);
        apply(attempt);
      })
      .catch((err: ApiError) => setError(err));
  }, [attemptId, apply]);

  useEffect(() => {
    // Read the token directly: the signed-in hook is still "false" on the first render.
    if (!getAccessToken()) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    load();
  }, [load, pathname, router]);

  // Leaving (tab switch, closing, navigating away) pauses the quiz. With a
  // question on screen, the server counts that question as wrong.
  useEffect(() => {
    const leave = () => {
      const { attempt: a, live: l } = state.current;
      if (!a || isFinished(a) || a.status === "PAUSED") return;
      pauseOnLeave(a.id);
      if (l) setLeftMidQuestion(true);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") leave();
      else if (state.current.attempt && !isFinished(state.current.attempt)) load();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", leave);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", leave);
      leave(); // navigating to another page inside the site
    };
  }, [load]);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      setError(null);
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const next = () =>
    act(async () => {
      const { attempt } = await apiJson<{ attempt: Attempt }>(`/api/quiz/attempts/${attemptId}/next`, { method: "POST" });
      setFeedback(null);
      setLeftMidQuestion(false);
      apply(attempt);
    });

  const answer = (chosen: number | null) => {
    if (!live || busy) return;
    const question = live.question;
    setLive(null);
    return act(async () => {
      const result = await apiJson<AnswerResult>(`/api/quiz/attempts/${attemptId}/answer`, { method: "POST", json: { optionIndex: chosen } });
      setFeedback({ result, chosen, question });
      setAttempt(result.attempt);
    });
  };

  const pauseNow = () =>
    act(async () => {
      const { attempt } = await apiJson<{ attempt: Attempt }>(`/api/quiz/attempts/${attemptId}/pause`, { method: "POST" });
      apply(attempt);
    });

  const tryAgain = () =>
    act(async () => {
      if (!attempt) return;
      const target = attempt.quiz ? { quizId: attempt.quiz.id } : attempt.chapter ? { chapterId: attempt.chapter.id } : null;
      if (!target) return;
      const { attempt: fresh } = await startQuiz(target);
      router.replace(quizHref(fresh.id));
    });

  if (error && !attempt) {
    return (
      <Panel>
        <h1 className="font-heading text-2xl font-extrabold">{error.status === 404 ? "We couldn't find this quiz" : "Something went wrong"}</h1>
        <p className="mt-2 text-muted-foreground">{error.status === 404 ? "It may belong to another account." : error.message}</p>
        <Link href="/#quiz" className="press-3d mt-6 inline-flex h-12 items-center justify-center rounded-xl px-6 font-bold">
          Back to quizzes
        </Link>
      </Panel>
    );
  }
  if (!attempt) {
    return (
      <Panel>
        <Loader2Icon className="mx-auto size-8 animate-spin text-brand-amber-text" aria-label="Loading the quiz" />
      </Panel>
    );
  }

  const chapterHref = chapterHrefOf(attempt);
  const errorLine = error && (
    <p role="alert" className="mt-4 rounded-xl bg-destructive/10 px-4 py-3 text-destructive">
      {error.message}{" "}
      {error.status === 409 && (
        <button type="button" onClick={load} className="font-semibold underline">
          Reload
        </button>
      )}
    </p>
  );

  // 1) Just answered: show how it went (if this quiz shows answers), then Next.
  if (feedback) {
    const done = isFinished(feedback.result.attempt);
    return (
      <Panel wide>
        <Progress attempt={attempt} />
        <FeedbackView feedback={feedback} />
        {errorLine}
        <button type="button" onClick={done ? () => setFeedback(null) : next} disabled={busy} className="press-3d mt-6 inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-lg font-bold">
          {busy ? <Loader2Icon className="size-5 animate-spin" /> : done ? <TrophyIcon className="size-5" /> : <PlayIcon className="size-5 fill-current" />}
          {done ? "See your result" : "Next question"}
        </button>
      </Panel>
    );
  }

  // 2) Finished (or ended at midnight): the result.
  if (isFinished(attempt)) {
    return <ResultView attempt={attempt} coinRule={coinRule} chapterHref={chapterHref} onTryAgain={tryAgain} busy={busy} error={errorLine} />;
  }

  // 3) A question is open: the timed question.
  if (live) {
    return (
      <Panel wide>
        <Progress attempt={attempt} />
        <QuestionView
          key={`${attempt.id}-${live.question.index}`}
          live={live}
          total={attempt.total}
          fullMs={attempt.secondsPerQuestion * 1000}
          disabled={busy}
          onAnswer={answer}
        />
        {errorLine}
        <p className="mt-4 text-center text-sm text-muted-foreground">Leaving this page now counts this question as wrong.</p>
      </Panel>
    );
  }

  // 4) No question open: the rules (first time) or "ready for the next one".
  const fresh = attempt.answered === 0;
  return (
    <Panel wide>
      {fresh ? <Guidelines attempt={attempt} /> : <Paused attempt={attempt} leftMidQuestion={leftMidQuestion} />}
      {errorLine}
      <button type="button" onClick={next} disabled={busy} className="press-3d mt-6 inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-lg font-bold">
        {busy ? <Loader2Icon className="size-5 animate-spin" /> : <PlayIcon className="size-5 fill-current" />}
        {fresh ? "Start the quiz" : `Continue: question ${attempt.answered + 1}`}
      </button>
      {!fresh && attempt.status === "IN_PROGRESS" && (
        <button type="button" onClick={pauseNow} disabled={busy} className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl font-semibold text-brand-amber-text hover:bg-accent">
          <PauseIcon className="size-5" /> Pause and finish later today
        </button>
      )}
      {chapterHref && (
        <Link href={chapterHref} className="mt-2 inline-flex min-h-12 w-full items-center justify-center rounded-2xl text-sm font-semibold text-muted-foreground hover:underline">
          Back to the chapter
        </Link>
      )}
    </Panel>
  );
}

function Panel({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return <div className={cn("card-3d mx-auto w-full rounded-3xl p-5 text-center sm:p-8", wide ? "max-w-2xl" : "max-w-md")}>{children}</div>;
}

function Progress({ attempt }: { attempt: Attempt }) {
  const done = attempt.answered;
  return (
    <div className="mb-5 text-left">
      <div className="flex items-center justify-between gap-3 text-sm font-semibold">
        <span className="truncate" lang="as">
          {attemptLabel(attempt)}
        </span>
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {Math.min(done + 1, attempt.total)} / {attempt.total}
        </span>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-accent" aria-hidden="true">
        <div className="h-full rounded-full bg-brand-amber transition-[width]" style={{ width: `${(done / attempt.total) * 100}%` }} />
      </div>
    </div>
  );
}

function Guidelines({ attempt }: { attempt: Attempt }) {
  const reveal =
    attempt.answerReveal === "AFTER_EACH"
      ? "After each answer you'll see if it was right."
      : attempt.answerReveal === "AT_END"
        ? "You'll see the right answers at the end."
        : "This quiz doesn't show the answers.";
  return (
    <div className="text-left">
      <p className="text-sm font-bold uppercase tracking-wider text-brand-amber-text">Before you start</p>
      <h1 className="mt-1 font-heading text-2xl font-extrabold sm:text-3xl" lang="as">
        {attemptLabel(attempt)}
      </h1>
      {attempt.chapter && <p className="text-muted-foreground">{attempt.chapter.classLevel.name}</p>}
      <ul className="mt-5 grid gap-3 text-[15px] leading-relaxed sm:text-base">
        <Rule icon={TimerIcon}>
          {attempt.total} questions. You get <strong>{attempt.secondsPerQuestion} seconds</strong> for each one, so answer from what you know.
        </Rule>
        <Rule icon={TrophyIcon}>
          Get <strong>{attempt.passMark} or more</strong> right to pass and earn coins.
        </Rule>
        <Rule icon={CheckIcon}>{reveal}</Rule>
        <Rule icon={XIcon}>
          If you leave the page or switch apps while a question is on screen, <strong>that question counts as wrong</strong>.
        </Rule>
        <Rule icon={ClockIcon}>You can pause between questions and finish later today. At midnight the quiz ends.</Rule>
      </ul>
    </div>
  );
}

function Rule({ icon: Icon, children }: { icon: typeof TimerIcon; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-brand-amber-text" aria-hidden="true">
        <Icon className="size-5" />
      </span>
      <span className="pt-1">{children}</span>
    </li>
  );
}

function Paused({ attempt, leftMidQuestion }: { attempt: Attempt; leftMidQuestion: boolean }) {
  return (
    <div>
      <Progress attempt={attempt} />
      <h1 className="font-heading text-2xl font-extrabold">{attempt.status === "PAUSED" ? "Quiz paused" : "Ready for the next question?"}</h1>
      {leftMidQuestion && <p className="mt-3 rounded-xl bg-destructive/10 px-4 py-3 text-destructive">You left during a question, so that one counted as wrong.</p>}
      <p className="mt-2 text-muted-foreground">
        {attempt.answered} of {attempt.total} answered. You can finish this quiz until midnight tonight.
      </p>
    </div>
  );
}

function QuestionView({ live, total, fullMs, disabled, onAnswer }: {
  live: Live;
  total: number;
  fullMs: number;
  disabled: boolean;
  onAnswer: (i: number | null) => void;
}) {
  const { question, deadlineAt } = live;
  const [remaining, setRemaining] = useState(question.remainingMs);
  const sent = useRef(false);
  const answerRef = useRef(onAnswer);
  useEffect(() => {
    answerRef.current = onAnswer;
  }, [onAnswer]);
  const seconds = Math.ceil(remaining / 1000);

  useEffect(() => {
    const tick = setInterval(() => {
      const left = Math.max(0, deadlineAt - Date.now());
      setRemaining(left);
      if (left === 0 && !sent.current) {
        sent.current = true;
        answerRef.current(null); // time's up (a late answer would count as wrong anyway)
      }
    }, 100);
    return () => clearInterval(tick);
  }, [deadlineAt]);

  const pick = (i: number) => {
    if (sent.current) return;
    sent.current = true;
    onAnswer(i);
  };

  return (
    <div>
      <Countdown remaining={remaining} fullMs={fullMs} seconds={seconds} />
      <p className="sr-only">
        Question {question.index + 1} of {total}. {seconds} seconds left.
      </p>
      <div className="rich mt-4 text-left font-heading text-xl font-bold sm:text-2xl" lang="as" dangerouslySetInnerHTML={{ __html: question.question }} />
      <div className="mt-5 grid gap-3">
        {question.options.map((option, i) => (
          <button
            key={i}
            type="button"
            onClick={() => pick(i)}
            disabled={disabled}
            className="card-3d lift flex min-h-16 items-center gap-3 rounded-2xl px-4 py-3 text-left text-lg disabled:opacity-60"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent font-heading font-extrabold text-brand-amber-text" aria-hidden="true">
              {LETTERS[i]}
            </span>
            <span className="rich min-w-0 flex-1" lang="as" dangerouslySetInnerHTML={{ __html: option }} />
          </button>
        ))}
      </div>
    </div>
  );
}

function Countdown({ remaining, fullMs, seconds }: { remaining: number; fullMs: number; seconds: number }) {
  // The ring empties over the question's time; red for the last 3 seconds.
  const r = 26;
  const c = 2 * Math.PI * r;
  const share = fullMs > 0 ? Math.min(1, remaining / fullMs) : 0;
  const urgent = seconds <= 3;
  return (
    <div className="mx-auto grid size-20 place-items-center" aria-hidden="true">
      <svg viewBox="0 0 64 64" className="col-start-1 row-start-1 size-20 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="7" className="stroke-accent" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - share)}
          className={cn("transition-[stroke-dashoffset] duration-100 ease-linear", urgent ? "stroke-destructive" : "stroke-brand-amber")}
        />
      </svg>
      <span className={cn("col-start-1 row-start-1 font-heading text-2xl font-extrabold tabular-nums", urgent ? "text-destructive" : "text-foreground")}>{seconds}</span>
    </div>
  );
}

function FeedbackView({ feedback }: { feedback: Feedback }) {
  const { result, chosen, question } = feedback;
  const shown = result.correct !== null;
  // No pick = the timer ran out here (the server may see it a moment before its own deadline).
  const timeUp = result.timedOut || chosen === null;
  const title = timeUp ? "Time's up!" : !shown ? "Answer saved" : result.correct ? "Correct! Well done." : "Not quite.";
  return (
    <div className="text-left">
      <p
        className={cn(
          "rounded-2xl px-4 py-3 font-heading text-xl font-extrabold",
          !shown && !timeUp ? "bg-accent" : result.correct ? "bg-success/12 text-success" : "bg-destructive/10 text-destructive"
        )}
        role="status"
      >
        {title}
      </p>
      <div className="rich mt-4 font-semibold" lang="as" dangerouslySetInnerHTML={{ __html: question.question }} />
      <OptionList options={question.options} chosen={chosen} correct={shown ? result.correctIndex : null} />
      {shown && result.explanation && <div className="rich mt-3 rounded-xl bg-secondary/70 px-4 py-3 text-[15px]" lang="as" dangerouslySetInnerHTML={{ __html: result.explanation }} />}
    </div>
  );
}

function OptionList({ options, chosen, correct }: { options: string[]; chosen: number | null; correct: number | null }) {
  return (
    <ul className="mt-3 grid gap-2">
      {options.map((o, i) => {
        const isAnswer = correct === i;
        const isWrongPick = chosen === i && correct !== null && correct !== i;
        return (
          <li
            key={i}
            className={cn(
              "flex items-center gap-3 rounded-xl border-2 px-3 py-2",
              isAnswer && "border-success bg-success/10",
              isWrongPick && "border-destructive bg-destructive/10",
              !isAnswer && !isWrongPick && chosen === i && "border-brand-amber",
              !isAnswer && !isWrongPick && chosen !== i && "opacity-70"
            )}
          >
            <span
              className={cn(
                "grid size-8 shrink-0 place-items-center rounded-lg font-heading text-sm font-extrabold",
                isAnswer ? "bg-success text-white" : isWrongPick ? "bg-destructive text-white" : "bg-accent text-brand-amber-text"
              )}
              aria-hidden="true"
            >
              {isAnswer ? <CheckIcon className="size-4" /> : isWrongPick ? <XIcon className="size-4" /> : LETTERS[i]}
            </span>
            <span className="rich min-w-0 flex-1" lang="as" dangerouslySetInnerHTML={{ __html: o }} />
            <span className="sr-only">{isAnswer ? "(correct answer)" : chosen === i ? "(your answer)" : ""}</span>
          </li>
        );
      })}
    </ul>
  );
}

const ZERO_COIN_REASON: Record<CoinRule, string> = {
  firstPassPerChapter: "You've already earned coins for this quiz before. Coins are given for the first pass only.",
  firstPassPerChapterPerDay: "You've already earned coins for this quiz today. Pass it again tomorrow to earn more.",
  everyPass: "This quiz doesn't give coins.",
};

function ResultView({ attempt, coinRule, chapterHref, onTryAgain, busy, error }: {
  attempt: Attempt;
  coinRule: CoinRule;
  chapterHref: string | null;
  onTryAgain: () => void;
  busy: boolean;
  error: React.ReactNode;
}) {
  const expired = attempt.status === "EXPIRED";
  const passed = attempt.status === "PASSED";
  const score = attempt.score ?? 0;
  // New coins: refresh the header chip and coin card.
  useEffect(() => {
    if (attempt.coinsAwarded > 0) announceCoinsChanged();
  }, [attempt.id, attempt.coinsAwarded]);
  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6">
      <Panel wide>
        <p className="text-sm font-bold uppercase tracking-wider text-brand-amber-text" lang="as">
          {attemptLabel(attempt, true)}
        </p>
        <div
          className="mx-auto mt-4 grid size-32 place-items-center rounded-full"
          style={{ background: `conic-gradient(${passed ? "var(--success)" : "var(--brand-amber-dark)"} ${(score / attempt.total) * 100}%, var(--accent) 0)` }}
          aria-hidden="true"
        >
          <span className="grid size-24 place-items-center rounded-full bg-card font-heading text-3xl font-extrabold tabular-nums">
            {score}/{attempt.total}
          </span>
        </div>
        <h1 className="mt-4 font-heading text-3xl font-extrabold">{expired ? "This quiz ended at midnight" : passed ? "You passed! 🎉" : "Not this time"}</h1>
        <p className="mt-2 text-muted-foreground">
          {expired
            ? "Unfinished quizzes end when the day ends (India time). Start a new one any time."
            : passed
              ? `You got ${score} out of ${attempt.total} right.`
              : `You got ${score} out of ${attempt.total}. You need ${attempt.passMark} to pass. Read the chapter again and try once more!`}
        </p>
        {passed &&
          (attempt.coinsAwarded > 0 ? (
            <p className="mx-auto mt-5 inline-flex items-center gap-3 rounded-2xl bg-[image:var(--header-bg)] px-5 py-3 font-heading text-xl font-extrabold text-brand-ink dark:text-brand-cream">
              <Coin3D className="size-10" /> +{attempt.coinsAwarded} coins
            </p>
          ) : (
            <p className="mt-4 rounded-xl bg-accent px-4 py-3 text-[15px]">{ZERO_COIN_REASON[coinRule]}</p>
          ))}
        {error}
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={onTryAgain} disabled={busy} className="press-3d inline-flex h-12 items-center justify-center gap-2 rounded-xl font-bold">
            {busy ? <Loader2Icon className="size-5 animate-spin" /> : <RotateCwIcon className="size-5" />} Try again
          </button>
          {chapterHref ? (
            <Link href={chapterHref} className="card-3d lift inline-flex h-12 items-center justify-center rounded-xl font-bold">
              Back to the chapter
            </Link>
          ) : (
            <Link href="/" className="card-3d lift inline-flex h-12 items-center justify-center rounded-xl font-bold">
              Home
            </Link>
          )}
        </div>
      </Panel>
      {attempt.review && attempt.review.length > 0 && <Review items={attempt.review} />}
    </div>
  );
}

function Review({ items }: { items: ReviewItem[] }) {
  return (
    <section aria-labelledby="review-title" className="text-left">
      <h2 id="review-title" className="mb-3 font-heading text-xl font-extrabold text-brand-amber-text">
        Your answers
      </h2>
      <ol className="grid gap-3">
        {items.map((r) => (
          <li key={r.index} className="card-3d rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg text-white", r.correct ? "bg-success" : "bg-destructive")} aria-hidden="true">
                {r.correct ? <CheckIcon className="size-4" /> : <XIcon className="size-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="sr-only">{r.correct ? "Correct." : "Wrong."}</p>
                {r.question ? (
                  <div className="rich font-semibold" lang="as" dangerouslySetInnerHTML={{ __html: r.question }} />
                ) : (
                  <p className="text-muted-foreground">This question was removed.</p>
                )}
                {!r.correct && r.chosenIndex === null && r.question && (
                  <p className="text-sm font-semibold text-destructive">{r.timedOut ? "Time ran out" : "No answer (time ran out or you left)"}</p>
                )}
              </div>
            </div>
            {r.options.length > 0 && <OptionList options={r.options} chosen={r.chosenIndex} correct={r.correctIndex} />}
            {r.explanation && <div className="rich mt-2 rounded-xl bg-secondary/70 px-3 py-2 text-[15px]" lang="as" dangerouslySetInnerHTML={{ __html: r.explanation }} />}
          </li>
        ))}
      </ol>
    </section>
  );
}
