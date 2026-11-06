"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useMe } from "@/components/site/account-menu";

// Pages a student with missing details may still open: the form itself,
// signing in/out and password pages, and the about/help/policy pages.
const OPEN_PATHS = ["/welcome", "/login", "/register", "/forgot-password", "/reset-password", "/about", "/contact", "/faq", "/privacy", "/terms", "/refund-policy"];

// A signed-in student whose class, district or date of birth is missing
// (Google sign-ups, accounts from before 6 Nov 2026) is sent to /welcome
// before using the site signed in. Guests and admins are never redirected.
export function ProfileGate() {
  const me = useMe();
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (!me || me.role !== "STUDENT" || me.profileComplete) return;
    if (OPEN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return;
    const next = `${pathname}${window.location.search}`;
    router.replace(`/welcome?next=${encodeURIComponent(next)}`);
  }, [me, pathname, router]);
  return null;
}
