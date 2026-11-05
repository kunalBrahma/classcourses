"use client";

import { useEffect } from "react";
import { readLanguage, startTranslation } from "@/lib/language";

// Loads Google's script only for visitors who picked another language, and only
// after React has taken over the page. Students on English never download it.
export function LanguageLoader() {
  useEffect(() => {
    if (readLanguage() !== "en") startTranslation();
  }, []);
  return null;
}
