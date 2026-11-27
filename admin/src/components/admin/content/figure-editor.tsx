"use client";

import { ChangeEvent, useDeferredValue, useId, useRef, useState } from "react";
import { ChevronDownIcon, CodeXmlIcon, ShieldCheckIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { QuestionFigure } from "@/components/admin/content/question-figure";
import { cn } from "@/lib/utils";

// "Interactive figure (HTML)" in the question window: paste or upload a whole
// HTML/CSS/JS file (a shape, an animation, a canvas), see it live, pick the box
// height. Saved as-is; students only ever see it inside the sandboxed iframe.

export interface FigureDraft {
  html: string;
  height: number; // px
  alt: string;
}

export const FIGURE_MAX_BYTES = 100 * 1024; // same as the server (question.service.ts)
export const FIGURE_MIN_HEIGHT = 120;
export const FIGURE_MAX_HEIGHT = 720;
const SIZES = [
  { label: "Small", px: 200 },
  { label: "Medium", px: 320 },
  { label: "Large", px: 480 },
];

export const figureBytes = (html: string) => new TextEncoder().encode(html.trim()).length;

/** The first problem with the figure, or null (mirrors normalizeQuestion()). */
export const figureProblem = (f: FigureDraft): string | null => {
  if (!f.html.trim()) return null;
  if (figureBytes(f.html) > FIGURE_MAX_BYTES) return `The figure is too big: ${(figureBytes(f.html) / 1024).toFixed(1)} KB of ${FIGURE_MAX_BYTES / 1024} KB.`;
  if (!/<[a-z!][\s\S]*>/i.test(f.html)) return "The figure must be HTML (e.g. a <div>, <svg> or <canvas>).";
  if (f.height < FIGURE_MIN_HEIGHT || f.height > FIGURE_MAX_HEIGHT) return `Choose a height between ${FIGURE_MIN_HEIGHT} and ${FIGURE_MAX_HEIGHT} px.`;
  return null;
};

export function FigureEditor({ value, onChange, showErrors }: { value: FigureDraft; onChange: (next: FigureDraft) => void; showErrors: boolean }) {
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  // Open when the question already has a figure
  const [open, setOpen] = useState(Boolean(value.html.trim()));
  const [fileError, setFileError] = useState<string | null>(null);
  // The preview follows typing without restarting the animation on every key
  const previewHtml = useDeferredValue(value.html);
  const set = (patch: Partial<FigureDraft>) => onChange({ ...value, ...patch });

  const bytes = figureBytes(value.html);
  const problem = figureProblem(value);
  const error = fileError ?? (showErrors || bytes > FIGURE_MAX_BYTES ? problem : null);

  const upload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // the same file can be picked again
    if (!file) return;
    setFileError(null);
    if (!/\.html?$/i.test(file.name) && file.type !== "text/html") return setFileError("Choose an .html file.");
    if (file.size > FIGURE_MAX_BYTES) return setFileError(`That file is ${(file.size / 1024).toFixed(1)} KB; the limit is ${FIGURE_MAX_BYTES / 1024} KB.`);
    set({ html: await file.text() });
  };

  const custom = !SIZES.some((s) => s.px === value.height);

  return (
    <div className="rounded-xl border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left hover:bg-muted/40"
      >
        <CodeXmlIcon className="size-4 shrink-0 text-brand-amber-text" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">
            Interactive figure (HTML) <span className="font-normal text-muted-foreground">(optional)</span>
          </span>
          <span className="block text-xs text-muted-foreground">
            {value.html.trim() ? `Added · ${(bytes / 1024).toFixed(1)} KB` : "A shape, animation or canvas shown under the question"}
          </span>
        </span>
        <ChevronDownIcon className={cn("size-4 shrink-0 transition", open && "rotate-180")} aria-hidden="true" />
      </button>

      {open && (
        <div id={`${id}-panel`} className="grid gap-4 border-t px-4 py-4">
          <p className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            <ShieldCheckIcon className="mt-px size-3.5 shrink-0 text-success" aria-hidden="true" />
            Paste a whole HTML file (with &lt;style&gt; and &lt;script&gt;) or just the part you need. It runs in a sealed box: it can&apos;t use the
            internet or see the student&apos;s account, so put everything (CSS, JS, images as data) inside the file.
          </p>

          <div className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor={`${id}-html`}>HTML, CSS and JavaScript</Label>
              <div className="flex gap-2">
                <input ref={fileRef} type="file" accept=".html,.htm,text/html" className="hidden" onChange={upload} />
                <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => fileRef.current?.click()}>
                  <UploadIcon /> Upload .html file
                </Button>
                {value.html && (
                  <Button type="button" variant="ghost" size="sm" className="h-8 text-destructive hover:text-destructive" onClick={() => set({ html: "", alt: "" })}>
                    <Trash2Icon /> Remove figure
                  </Button>
                )}
              </div>
            </div>
            <Textarea
              id={`${id}-html`}
              value={value.html}
              onChange={(e) => {
                setFileError(null);
                set({ html: e.target.value });
              }}
              placeholder={'<style>\n  .box { width: 120px; height: 120px; background: #f5a623; }\n</style>\n<div class="box"></div>'}
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              aria-invalid={error ? true : undefined}
              aria-describedby={`${id}-size${error ? ` ${id}-error` : ""}`}
              className="max-h-72 min-h-40 overflow-y-auto font-mono text-xs leading-relaxed [field-sizing:fixed] [tab-size:2]"
            />
            <p id={`${id}-size`} className={cn("text-xs tabular-nums", bytes > FIGURE_MAX_BYTES ? "text-destructive" : "text-muted-foreground")}>
              {(bytes / 1024).toFixed(1)} KB of {FIGURE_MAX_BYTES / 1024} KB
            </p>
            {error && (
              <p id={`${id}-error`} role="alert" className="text-xs font-medium text-destructive">
                {error}
              </p>
            )}
          </div>

          {value.html.trim() && (
            <>
              <div className="grid gap-2">
                <span className="text-sm font-medium">Box height</span>
                <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Box height">
                  {SIZES.map((s) => (
                    <button
                      key={s.px}
                      type="button"
                      role="radio"
                      aria-checked={value.height === s.px}
                      onClick={() => set({ height: s.px })}
                      className={cn(
                        "h-8 rounded-full border px-3 text-xs font-medium transition",
                        value.height === s.px ? "border-primary bg-primary/10 text-brand-amber-text" : "bg-card hover:bg-muted"
                      )}
                    >
                      {s.label} · {s.px}px
                    </button>
                  ))}
                  <label className={cn("flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium", custom && "border-primary bg-primary/10 text-brand-amber-text")}>
                    Custom
                    <Input
                      type="number"
                      min={FIGURE_MIN_HEIGHT}
                      max={FIGURE_MAX_HEIGHT}
                      value={value.height}
                      onChange={(e) => set({ height: Number(e.target.value) || 0 })}
                      className="h-6 w-16 px-1.5 text-xs"
                      aria-label="Custom height in pixels"
                    />
                    px
                  </label>
                </div>
              </div>

              <div className="grid gap-2">
                <span className="text-sm font-medium">Preview</span>
                <QuestionFigure figure={{ html: previewHtml, height: value.height, alt: value.alt }} className="my-0" />
                <p className="text-xs text-muted-foreground">Exactly what students see, in the same sealed box. On phones it&apos;s at most 70% of the screen tall.</p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor={`${id}-alt`}>
                  Description <span className="font-normal text-muted-foreground">(optional, for students who can&apos;t see it)</span>
                </Label>
                <Input id={`${id}-alt`} value={value.alt} maxLength={300} onChange={(e) => set({ alt: e.target.value })} placeholder="e.g. A blue triangle that turns red when tapped" className="h-10" />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
