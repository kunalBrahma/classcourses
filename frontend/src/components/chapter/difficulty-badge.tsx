import type { Difficulty } from "@/lib/server-api";
import { cn } from "@/lib/utils";

const LABEL = { EASY: "Easy", MEDIUM: "Medium", HARD: "Hard" } as const;

// Only shown when the admin set one (difficulty levels are still a client question, #7).
export function DifficultyBadge({ value }: { value: Difficulty }) {
  if (!value) return null;
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-xs font-bold",
        value === "EASY" && "bg-success/12 text-success",
        value === "MEDIUM" && "bg-accent text-brand-amber-text",
        value === "HARD" && "bg-destructive/10 text-destructive"
      )}
    >
      {LABEL[value]}
    </span>
  );
}
