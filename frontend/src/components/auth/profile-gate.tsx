"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useMe } from "@/components/site/account-menu";

// Pages a student with missing details may still open: the form itself,
// signing in/out and password pages, and the about/help/policy pages.
const OPEN_PATHS = ["/welcome", "/parent-consent", "/consent", "/login", "/register", "/forgot-password", "/reset-password", "/about", "/contact", "/faq", "/privacy", "/terms", "/refund-policy"];

// A signed-in student whose class, district or date of birth is missing
// (Google sign-ups, accounts from before 6 Nov 2026) is sent to /welcome, and
// a student under 18 who hasn't asked a parent yet to /parent-consent, before
// using the site signed in. Guests and admins are never redirected.
export function ProfileGate() {
  const me = useMe();
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (!me || me.role !== "STUDENT") return;
    if (OPEN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return;
    const next = encodeURIComponent(`${pathname}${window.location.search}`);
    if (!me.profileComplete) router.replace(`/welcome?next=${next}`);
    // Under 18 and no parent asked yet: ask once. While waiting for the answer
    // the student can browse (ConsentBanner says why quizzes are off).
    else if (me.access?.block === "CONSENT_REQUIRED" && me.access.consent.status === "NONE") router.replace(`/parent-consent?next=${next}`);
  }, [me, pathname, router]);
  return null;
}
