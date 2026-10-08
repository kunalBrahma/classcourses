import Link from "next/link";
import { ArrowRightIcon, BookOpenCheckIcon, CoinsIcon, ListChecksIcon, TimerIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMediums, getSiteSettings } from "@/lib/server-api";

function HeroCards() {
  const card = "absolute inset-0 rounded-3xl motion-safe:animate-[cc-deal_700ms_cubic-bezier(.2,.8,.2,1)_both]";
  return (
    <div className="relative mx-auto h-48 w-72 sm:h-56 sm:w-80" aria-hidden="true">
      <div className={`${card} bg-[#312e81] shadow-2xl`} style={{ transform: "translate(26px, 26px) rotate(7deg)", ["--cc-rot" as string]: "7deg", ["--cc-rot-from" as string]: "18deg", animationDelay: "60ms" }} />
      <div className={`${card} bg-[#4338ca] shadow-2xl`} style={{ transform: "translate(13px, 13px) rotate(3.5deg)", ["--cc-rot" as string]: "3.5deg", ["--cc-rot-from" as string]: "12deg", animationDelay: "140ms" }} />
      <div
        className={`${card} flex flex-col justify-between bg-gradient-to-br from-[#6366f1] to-[#4f46e5] p-6 text-white shadow-[0_28px_50px_-16px_rgba(31,29,74,.7),inset_0_1px_0_rgba(255,255,255,.25)]`}
        style={{ ["--cc-rot-from" as string]: "-6deg", animationDelay: "220ms" }}
      >
        <span className="font-heading text-4xl font-bold leading-none">Class 1 – 12</span>
        <span>
          <span lang="as" className="block text-lg text-indigo-100">অসমীয়া · English</span>
          <span className="text-sm text-indigo-200">Q&amp;A · MCQ · Quiz · Notes</span>
        </span>
      </div>
    </div>
  );
}

export default async function HomePage() {
  const [{ site, quiz, coins }, mediums] = await Promise.all([getSiteSettings(), getMediums()]);

  const steps = [
    { icon: BookOpenCheckIcon, title: "Read", text: "Textbook question-answers for every chapter, plus extra advanced ones." },
    { icon: ListChecksIcon, title: "Practise", text: "Tap-to-check MCQs with explanations, chapter by chapter." },
    { icon: TimerIcon, title: "Take the quiz", text: `${quiz.questionsPerQuiz} questions, ${quiz.secondsPerQuestion} seconds each. Score ${quiz.passMark} to pass.` },
    { icon: CoinsIcon, title: "Earn coins", text: `Pass a chapter quiz to earn ${coins.perPass} coins — use them for up to ${coins.maxDiscountPercent}% off notes.` },
  ];

  return (
    <>
      {/* Hero */}
      <section
        className="relative overflow-hidden bg-brand-navy text-white"
        style={{
          backgroundImage:
            "radial-gradient(circle at 85% 0%, rgba(99,102,241,.55), transparent 50%), radial-gradient(circle at 0% 100%, rgba(245,158,11,.18), transparent 45%), radial-gradient(rgba(255,255,255,.06) 1px, transparent 1px)",
          backgroundSize: "auto, auto, 22px 22px",
        }}
      >
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 sm:px-6 md:grid-cols-[1.15fr_1fr] md:py-20">
          <div className="motion-safe:animate-[cc-rise_600ms_ease-out_both]">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-indigo-100">
              For students of Assam
            </p>
            <h1 className="mt-5 font-heading text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              Every chapter.
              <br />
              <span className="bg-gradient-to-r from-amber-300 to-amber-500 bg-clip-text text-transparent">Every answer.</span>
            </h1>
            <p lang="as" className="mt-4 text-xl text-indigo-100/90">
              শ্ৰেণী ১–১২ ৰ সকলো অধ্যায়ৰ প্ৰশ্নোত্তৰ।
            </p>
            <p className="mt-4 max-w-lg text-base leading-relaxed text-indigo-100/80">
              Free question-answers, MCQs and quick quizzes for Class 1 to 12 — in Assamese and English medium. Learn a chapter, test yourself, earn coins.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild className="press-3d h-12 rounded-xl bg-brand-amber px-6 text-base font-bold text-brand-navy hover:bg-amber-400">
                <Link href="#classes">
                  Choose your class <ArrowRightIcon />
                </Link>
              </Button>
              <Button asChild variant="ghost" className="h-12 rounded-xl px-5 text-base font-semibold text-white hover:bg-white/10 hover:text-white">
                <Link href="/register">Join free</Link>
              </Button>
            </div>
          </div>
          <HeroCards />
        </div>
      </section>

      {/* Mediums */}
      <section id="classes" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-14 sm:px-6">
        <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">Pick your medium</h2>
        <p className="mt-2 text-muted-foreground">Then choose your class and subject.</p>
        {mediums.length === 0 ? (
          <p className="card-3d mt-8 p-8 text-center text-muted-foreground">Classes are being set up — please check back soon.</p>
        ) : (
          <ul className="mt-8 grid gap-5 sm:grid-cols-2">
            {mediums.map((m, i) => (
              <li key={m.id}>
                <Link href={`/${m.slug}`} className="card-3d lift group flex items-center gap-5 p-6 sm:p-7">
                  <span
                    className={`grid size-16 shrink-0 place-items-center rounded-2xl font-heading text-2xl font-extrabold text-white shadow-[0_4px_0_rgba(0,0,0,.25)] ${
                      i % 2 === 0 ? "bg-gradient-to-br from-[#6366f1] to-[#4338ca]" : "bg-gradient-to-br from-amber-400 to-amber-600"
                    }`}
                    aria-hidden="true"
                  >
                    {m.nativeName?.[0] ?? m.name[0]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-heading text-2xl font-bold">{m.name}</span>
                    {m.nativeName && (
                      <span lang="as" className="block text-lg text-muted-foreground">
                        {m.nativeName}
                      </span>
                    )}
                  </span>
                  <ArrowRightIcon className="size-6 shrink-0 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* How it works */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-6 sm:px-6">
        <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">How {site.name} works</h2>
        <ol className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s.title} className="card-3d p-6">
              <span className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                  <s.icon className="size-6" />
                </span>
                <span className="font-heading text-sm font-bold text-muted-foreground">Step {i + 1}</span>
              </span>
              <p className="mt-4 font-heading text-xl font-bold">{s.title}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
