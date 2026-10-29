import { CheckIcon } from "lucide-react";
import { Coin3D } from "@/components/kit/coin";

// Decorative hero art for the About page: the site's stacked "3D" cards
// (classes, what's inside), a quiz result and a coin reward. Pure CSS.
export function AboutVisual({ classRange, passMark, questions, coins }: { classRange: string; passMark: number; questions: number; coins: number }) {
  return (
    <div className="relative mx-auto h-56 w-full max-w-sm sm:h-64" aria-hidden="true">
      <div className="absolute inset-x-6 top-6 h-36 rotate-6 rounded-3xl bg-[#8a5a00] shadow-[0_18px_40px_-12px_rgb(0_0_0/0.45)] sm:h-40" />
      <div className="absolute inset-x-6 top-6 h-36 rotate-3 rounded-3xl bg-brand-amber-dark shadow-[0_18px_40px_-12px_rgb(0_0_0/0.4)] sm:h-40" />
      <div className="absolute inset-x-6 top-6 flex h-36 flex-col justify-between rounded-3xl bg-gradient-to-br from-brand-amber-light to-brand-amber p-5 text-brand-ink shadow-[0_24px_50px_-14px_rgb(0_0_0/0.45),inset_0_1px_0_rgb(255_255_255/0.4)] sm:h-40">
        <span className="font-heading text-2xl font-extrabold sm:text-3xl">{classRange}</span>
        <span className="flex flex-wrap gap-1.5 text-xs font-bold">
          {["Q&A", "MCQs", "Notes", "Quiz"].map((t) => (
            <span key={t} className="rounded-full bg-white/45 px-2.5 py-1">
              {t}
            </span>
          ))}
        </span>
      </div>
      {/* Quiz result chip */}
      <div className="absolute bottom-2 left-0 flex items-center gap-2 rounded-2xl bg-card px-3 py-2 text-sm font-bold text-card-foreground shadow-[var(--depth-shadow)] sm:bottom-4">
        <span className="grid size-7 place-items-center rounded-full bg-success text-white">
          <CheckIcon className="size-4" />
        </span>
        {passMark + 1}/{questions} · Passed!
      </div>
      {/* Coin reward */}
      <div className="absolute -top-1 right-0 flex items-center gap-2 rounded-2xl bg-card py-1.5 pl-1.5 pr-3 text-sm font-extrabold text-card-foreground shadow-[var(--depth-shadow)]">
        <Coin3D className="size-8 text-xs" />+{coins} coins
      </div>
    </div>
  );
}
