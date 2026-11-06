import { useEffect, useState } from "react";
import { apiJson, publicJson } from "@/lib/api";

// The student profile asked at sign-up and in "complete your profile"
// (client requirements of 6 Nov 2026): class, district and date of birth,
// mobile number optional, no school. The server checks everything again
// (backend/src/services/profile.service.ts).

export interface ProfileOption {
  id: string;
  name: string;
  nativeName: string | null;
}
export interface ProfileOptions {
  classes: ProfileOption[];
  districts: ProfileOption[];
}

export interface ProfileDraft {
  classLevelId: string;
  districtId: string;
  day: string;
  month: string; // "1"–"12"
  year: string;
  phone: string;
}

export const EMPTY_DRAFT: ProfileDraft = { classLevelId: "", districtId: "", day: "", month: "", year: "", phone: "" };

// Same rule as the backend (auth.validation.ts): spaces, dashes and a
// +91 / 91 / 0 prefix are fine; what's left must be a 10-digit mobile number.
export const normalisePhone = (v: string) => v.replace(/[\s()-]/g, "").replace(/^(\+?91|0)(?=\d{10}$)/, "");
export const validPhone = (v: string) => /^[6-9]\d{9}$/.test(normalisePhone(v));

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const pad = (n: string) => n.padStart(2, "0");
export const dobString = (d: Pick<ProfileDraft, "day" | "month" | "year">) => (d.day && d.month && d.year ? `${d.year}-${pad(d.month)}-${pad(d.day)}` : null);
export const draftFromDob = (dob: string | null) => {
  const m = dob ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob) : null;
  return m ? { year: m[1], month: String(Number(m[2])), day: String(Number(m[3])) } : { year: "", month: "", day: "" };
};

// Years a student can pick: from 3 years ago back to 100 years ago.
export const birthYears = (now = new Date()) => {
  const last = now.getFullYear() - 3;
  return Array.from({ length: 98 }, (_, i) => String(last - i));
};

// The first problem, in plain words, or null. Phone is optional.
export const draftProblem = (d: ProfileDraft, { needDob = true } = {}): string | null => {
  if (!d.classLevelId) return "Please choose your class.";
  if (!d.districtId) return "Please choose your district.";
  if (needDob) {
    if (!d.day || !d.month || !d.year) return "Please choose the day, month and year you were born.";
    const date = new Date(Date.UTC(Number(d.year), Number(d.month) - 1, Number(d.day)));
    if (date.getUTCDate() !== Number(d.day)) return `${MONTHS[Number(d.month) - 1]} ${d.year} doesn't have a day ${d.day}. Please check the date.`;
  }
  if (d.phone.trim() && !validPhone(d.phone)) return "Enter a 10-digit mobile number, e.g. 98765 43210, or leave it empty.";
  return null;
};

// Classes and districts for the forms (public; they change rarely).
let cached: Promise<ProfileOptions> | null = null;
export function useProfileOptions() {
  const [options, setOptions] = useState<ProfileOptions | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    cached ??= publicJson<ProfileOptions>("/api/auth/profile-options");
    cached
      .then((o) => active && setOptions(o))
      .catch((err: Error) => {
        cached = null;
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, []);
  return { options, error };
}

// Where to go right after signing in: a student with missing details goes
// straight to "complete your profile" (so `next` doesn't flash first).
export const whereAfterSignIn = async (next: string) => {
  try {
    const { user } = await apiJson<{ user: { role: string; profileComplete: boolean } }>("/api/auth/me");
    if (user.role === "STUDENT" && !user.profileComplete) return `/welcome?next=${encodeURIComponent(next)}`;
  } catch {
    /* the gate checks again on the next page */
  }
  return next;
};
