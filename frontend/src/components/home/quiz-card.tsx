import { TimerIcon } from "lucide-react";
import { SectionTitle } from "@/components/kit/section-title";
import { QuizUsage } from "@/components/home/quiz-usage";
import { StartQuizButton } from "@/components/home/start-quiz";
import type { PublicSettings } from "@/lib/server-api";

const COIN_RULE = {
  firstPassPerChapter: "You get coins the first time you pass each chapter's quiz.",
  firstPassPerChapterPerDay: "You get coins for the first pass of each chapter, once a day.",
  everyPass: "You get coins every time you pass.",
} as const;

// The mock's quiz box: pass ring, title, "10 sec/question • Pass: 7/10",
// Start Quiz, and one paragraph of rules. Numbers come from the admin's quiz
// settings and the pause rule is worded the way the server enforces it.
export function QuizCard({ quiz, coins }: Pick<PublicSettings, "quiz" | "coins">) {
  const share = Math.round((quiz.passMark / quiz.questionsPerQuiz) * 100);
  return (
    <section id="quiz" className="scroll-mt-24" aria-labelledby="quiz-title">
      <SectionTitle icon={TimerIcon}>
        <span id="quiz-title">Quizzes</span>
      </SectionTitle>
      <div className="card-3d rounded-3xl p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div
            className="grid size-[52px] shrink-0 place-items-center rounded-full"
            style={{ background: `conic-gradient(var(--brand-amber-dark) ${share}%, var(--accent) 0)` }}
            aria-hidden="true"
          >
            <span className="grid size-[42px] place-items-center rounded-full bg-card font-heading text-xs font-extrabold tabular-nums text-brand-amber-text">
              {quiz.passMark}/{quiz.questionsPerQuiz}
            </span>
          </div>
          <div className="min-w-0">
            <h3 className="font-heading font-extrabold">Daily Chapter Quiz</h3>
            <p className="text-sm text-muted-foreground">
              {quiz.secondsPerQuestion} sec/question • Pass: {quiz.passMark}/{quiz.questionsPerQuiz}
            </p>
          </div>
          <StartQuizButton />
        </div>
        {/* Short on purpose (Class 1 readers); every rule here is what the server enforces. */}
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {quiz.questionsPerQuiz} questions, {quiz.secondsPerQuestion} seconds each: answer from what you know, not Google. Score{" "}
          {quiz.passMark} or more to earn {coins.perPass} coins. {COIN_RULE[coins.awardRule ?? "firstPassPerChapter"]} A quiz you leave stays paused
          until the day ends, and a question left on screen counts as wrong.
        </p>
        <QuizUsage />
      </div>
    </section>
  );
}
