import { cn } from "@/lib/utils";

// The student's avatar, chosen by the gender picked at sign-up (27 Nov 2026):
// a friendly flat face for male, female and other. Plain SVG (no emoji, no
// image request), with its own background so it reads the same in dark mode.
// Copy of the student site's frontend/src/components/kit/gender-avatar.tsx;
// keep the two in step.

export type Gender = "MALE" | "FEMALE" | "OTHER";

export const GENDER_LABEL: Record<Gender, string> = { MALE: "Male", FEMALE: "Female", OTHER: "Other" };

const THEME: Record<Gender, { bg: string; shirt: string }> = {
  MALE: { bg: "#d6e9ff", shirt: "#3b7fc4" },
  FEMALE: { bg: "#ffdbe7", shirt: "#d9577a" },
  OTHER: { bg: "#e6defc", shirt: "#7c62cc" },
};

const SKIN = "#f1c196";
const SKIN_SHADE = "#dfa57a";
const HAIR = "#3a2a00";
const INK = "#2e2000";

export function GenderAvatar({ gender, className, title }: { gender: Gender; className?: string; title?: string }) {
  const t = THEME[gender];
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn("shrink-0", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <rect width="64" height="64" rx="16" fill={t.bg} />

      {/* Long hair behind the head (female) */}
      {gender === "FEMALE" && <path d="M17 31C17 18 24 12.5 32 12.5S47 18 47 31v13.5c0 3-2 5-5 5H22c-3 0-5-2-5-5Z" fill={HAIR} />}

      {/* Shoulders and neck */}
      <path d="M11 64c0-11 9-17 21-17s21 6 21 17Z" fill={t.shirt} />
      <path d="M27 41h10v7.5a5 5 0 0 1-10 0Z" fill={SKIN_SHADE} />

      {/* Face */}
      <circle cx="32" cy="30" r="13" fill={SKIN} />
      <circle cx="19.5" cy="31" r="2.6" fill={SKIN} />
      <circle cx="44.5" cy="31" r="2.6" fill={SKIN} />

      {/* Hair on top */}
      {gender === "MALE" && <path d="M18.6 29.5C18 18.5 24.5 14 32.5 14c8.5 0 13.6 5.4 12.9 15.5-1.2-4.6-4.4-7.6-8.6-8.3-3.3 2.4-9 3.4-14.4 2.2-1.9 1.5-3.2 3.6-3.8 6.1Z" fill={HAIR} />}
      {gender === "FEMALE" && (
        <>
          <path d="M19 29.5c.4-9.6 6.2-14.5 13-14.5 7.2 0 12.8 4.9 13 14.5-4.6-1.4-9-4.6-11.6-8.6-2.4 4.2-7.6 7.4-14.4 8.6Z" fill={HAIR} />
          {/* Hair clip */}
          <circle cx="41.5" cy="19.5" r="3.2" fill="#f5a623" />
          <circle cx="41.5" cy="19.5" r="1.2" fill="#fff7e8" />
        </>
      )}
      {gender === "OTHER" && (
        <>
          {/* Soft curly top */}
          <g fill={HAIR}>
            <circle cx="22.5" cy="23.5" r="5" />
            <circle cx="27.5" cy="18.5" r="5.5" />
            <circle cx="34" cy="17" r="5.8" />
            <circle cx="40.5" cy="19.5" r="5.3" />
            <circle cx="43.5" cy="25" r="4.2" />
          </g>
          {/* Little star */}
          <path d="m51 10 1.3 2.9 3.1.3-2.4 2 .7 3.1L51 16.7l-2.7 1.6.7-3.1-2.4-2 3.1-.3Z" fill="#f5a623" />
        </>
      )}

      {/* Eyes, cheeks, smile */}
      <circle cx="27" cy="31" r="1.7" fill={INK} />
      <circle cx="37" cy="31" r="1.7" fill={INK} />
      <circle cx="24.2" cy="35.2" r="2" fill="#f28c8c" opacity=".45" />
      <circle cx="39.8" cy="35.2" r="2" fill="#f28c8c" opacity=".45" />
      <path d="M28.2 36.2c2.2 2.4 5.4 2.4 7.6 0" fill="none" stroke={INK} strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
