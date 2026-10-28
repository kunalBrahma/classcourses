import { StartQuizButton } from "@/components/quiz/start-quiz-button";
import type { PublicQuiz } from "@/lib/server-api";

// The chapter's quizzes (automatic chapter quiz + any custom quiz on it), with
// the quiz's own rules, which can differ from the site defaults.
export function ChapterQuizzes({ quizzes, chapterId }: { quizzes: PublicQuiz[]; chapterId: string }) {
  return (
    <ul className="grid gap-4">
      {quizzes.map((q) => {
        const share = Math.round((Math.min(q.passMark, q.questions) / q.questions) * 100);
        return (
          <li key={q.id} className="card-3d rounded-3xl p-5">
            <div className="flex flex-wrap items-center gap-4">
              <div
                className="grid size-16 shrink-0 place-items-center rounded-full"
                style={{ background: `conic-gradient(var(--brand-amber-dark) ${share}%, var(--accent) 0)` }}
                aria-hidden="true"
              >
                <span className="grid size-12 place-items-center rounded-full bg-card font-heading text-sm font-extrabold tabular-nums text-brand-amber-text">
                  {q.passMark}/{q.questions}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-heading text-lg font-extrabold" lang="as">
                  {q.title}
                </h3>
                <p className="text-[15px] text-muted-foreground">
                  {q.questions} questions · {q.secondsPerQuestion} seconds each · pass with {q.passMark}
                  {q.coinsPerPass > 0 && ` · ${q.coinsPerPass} coins`}
                </p>
                {q.description && (
                  <p className="mt-1 text-[15px]" lang="as">
                    {q.description}
                  </p>
                )}
              </div>
              <StartQuizButton quizId={q.id} chapterId={chapterId} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
