"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

// The picker (Radix dialog) loads on the first tap, like the header panels.
const QuizPicker = dynamic(() => import("@/components/quiz/quiz-picker").then((m) => m.QuizPicker), { ssr: false });

// "Start Quiz" on the home quiz box: opens the class → quiz picker.
// Also opens by itself on /#start-quiz (e.g. back from signing in).
export function StartQuizButton() {
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const fromHash = () => {
      if (window.location.hash === "#start-quiz") {
        setLoaded(true);
        setOpen(true);
      }
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setLoaded(true);
          setOpen(true);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="press-3d ml-auto inline-flex h-11 items-center rounded-4xl px-5 font-extrabold"
      >
        Start Quiz
      </button>
      {loaded && <QuizPicker open={open} onOpenChange={setOpen} />}
    </>
  );
}
