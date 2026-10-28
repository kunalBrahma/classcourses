"use client";

import { useEffect } from "react";
import { readMediumCookie, setMediumCookie } from "@/lib/medium";

// Visiting a medium's pages makes it the student's medium for the home page.
export function RememberMedium({ slug }: { slug: string }) {
  useEffect(() => {
    if (readMediumCookie() !== slug) setMediumCookie(slug);
  }, [slug]);
  return null;
}
