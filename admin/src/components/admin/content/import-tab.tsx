"use client";

import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2Icon, DownloadIcon, FileUpIcon, Loader2Icon, SearchCheckIcon, XCircleIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/admin/confirm";
import { actionButton, formCard, pressable } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Row {
  row: number;
  errors: string[];
  preview: { kind: "QA" | "MCQ"; source: "TEXTBOOK" | "EXTRA"; question: string; optionCount: number; useInQuiz: boolean } | null;
}
interface Summary {
  total: number;
  valid: number;
  invalid: number;
  mode: "append" | "replace";
  existingQuestions: number;
  willDelete: number;
  imported?: number;
}

// Templates match the backend importer (backend/src/services/questionImport.service.ts).
const CSV_TEMPLATE = [
  "kind,source,question,answer,option_a,option_b,option_c,option_d,correct,explanation,difficulty,quiz",
  'qa,textbook,"Who wrote the poem?","The poem was written by Lakshminath Bezbaroa.",,,,,,,,',
  'qa,extra,"অসমৰ ৰাজধানী কি?","দিছপুৰ",,,,,,,,',
  'mcq,textbook,"What is H2O?",,Salt,Water,Sugar,Oil,B,"Two hydrogen atoms and one oxygen atom.",easy,yes',
  'mcq,extra,"2 + 2 = ?",,3,4,5,22,B,,,no',
].join("\n");

const JSON_TEMPLATE = JSON.stringify(
  [
    { kind: "qa", source: "textbook", question: "Who wrote the poem?", answer: "Lakshminath Bezbaroa." },
    { kind: "mcq", source: "extra", question: "2 + 2 = ?", options: ["3", "4", "5", "22"], correct: "B", explanation: "Basic addition", difficulty: "easy", quiz: "yes" },
  ],
  null,
  2
);

const download = (name: string, text: string, type: string) => {
  // BOM so Excel opens Assamese text in UTF-8
  const blob = new Blob([type === "text/csv" ? "﻿" + text : text], { type: `${type};charset=utf-8` });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
};

const plain = (html: string) => html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

export function ImportTab({ chapterId, existing, onImported }: { chapterId: string; existing: number; onImported: () => void }) {
  const id = useId();
  const confirm = useConfirm();
  const fileInput = useRef<HTMLInputElement>(null);
  const [data, setData] = useState("");
  const [format, setFormat] = useState<"csv" | "json">("csv");
  const [mode, setMode] = useState<"append" | "replace">("append");
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ summary: Summary; rows: Row[] } | null>(null);
  const [busy, setBusy] = useState<"check" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const changed = () => {
    setPreview(null);
    setError(null);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (/\.xlsx?$/i.test(file.name)) {
      setError("Excel files can't be read directly. In Excel: File → Save As → “CSV UTF-8 (Comma delimited)”, then upload that.");
      return;
    }
    if (file.size > 2_000_000) {
      setError("That file is over 2 MB. Split it into smaller files (500 rows at most per import).");
      return;
    }
    setData(await file.text());
    setFormat(/\.json$/i.test(file.name) ? "json" : "csv");
    setFileName(file.name);
    changed();
    if (fileInput.current) fileInput.current.value = "";
  };

  const check = async () => {
    setBusy("check");
    setError(null);
    try {
      const res = await apiJson<{ summary: Summary; rows: Row[] }>(`/api/admin/chapters/${chapterId}/questions/import`, {
        method: "POST",
        json: { format, data, mode, dryRun: true },
      });
      setPreview(res);
    } catch (err) {
      setPreview(null);
      setError((err as ApiError).message);
    } finally {
      setBusy(null);
    }
  };

  const commit = async () => {
    if (!preview) return;
    if (
      mode === "replace" &&
      preview.summary.willDelete > 0 &&
      !(await confirm({
        title: `Replace all ${preview.summary.willDelete} questions?`,
        description: `Every existing question in this chapter is deleted and replaced by the ${preview.summary.valid} imported ones.`,
        confirmLabel: "Replace",
        destructive: true,
      }))
    )
      return;
    setBusy("import");
    try {
      const res = await apiJson<{ summary: Summary }>(`/api/admin/chapters/${chapterId}/questions/import`, {
        method: "POST",
        json: { format, data, mode, dryRun: false },
      });
      toast.success(`${res.summary.imported} questions imported`);
      setData("");
      setFileName(null);
      setPreview(null);
      onImported();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(null);
    }
  };

  const s = preview?.summary;

  return (
    <div className="grid gap-6">
      <Card className={formCard}>
        <CardHeader>
          <CardTitle className="font-heading text-lg">Bulk import</CardTitle>
          <CardDescription>
            Upload or paste questions from a spreadsheet. Nothing is saved until you check the preview — and then either every row goes in, or none.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="h-9" onClick={() => download("classcourse-questions-template.csv", CSV_TEMPLATE, "text/csv")}>
              <DownloadIcon /> CSV template
            </Button>
            <Button variant="outline" size="sm" className="h-9" onClick={() => download("classcourse-questions-template.json", JSON_TEMPLATE, "application/json")}>
              <DownloadIcon /> JSON template
            </Button>
          </div>

          <details className="rounded-xl border bg-muted/30 px-4 py-3 text-sm">
            <summary className="cursor-pointer font-semibold">Column guide</summary>
            <ul className="mt-2 space-y-1 text-muted-foreground">
              <li><strong className="text-foreground">question</strong> — required. Line breaks in a cell are kept.</li>
              <li><strong className="text-foreground">kind</strong> — <code>qa</code> or <code>mcq</code> (blank: mcq if options are filled, else qa).</li>
              <li><strong className="text-foreground">source</strong> — <code>textbook</code> (default) or <code>extra</code>.</li>
              <li><strong className="text-foreground">answer</strong> — for question-answers.</li>
              <li><strong className="text-foreground">option_a … option_f</strong> + <strong className="text-foreground">correct</strong> (A–F or 1–6) — for MCQs.</li>
              <li><strong className="text-foreground">explanation</strong>, <strong className="text-foreground">difficulty</strong> (easy / medium / hard) — optional.</li>
                <li><strong className="text-foreground">quiz</strong> (yes / no) — MCQs only: “no” keeps it as practice and out of quizzes. Blank = yes.</li>
              <li>From Excel or Google Sheets: download as <strong className="text-foreground">CSV (UTF-8)</strong> so Assamese text stays correct.</li>
            </ul>
          </details>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="secondary" className={actionButton} onClick={() => fileInput.current?.click()}>
              <FileUpIcon /> Choose file
            </Button>
            <input ref={fileInput} type="file" accept=".csv,.json,.txt,.xlsx,.xls,text/csv,application/json" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            <span className="text-sm text-muted-foreground">{fileName ?? "or paste below"}</span>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={`${id}-data`}>Data</Label>
              <div role="radiogroup" aria-label="Format" className="flex rounded-lg border p-0.5 text-xs">
                {(["csv", "json"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    role="radio"
                    aria-checked={format === f}
                    onClick={() => {
                      setFormat(f);
                      changed();
                    }}
                    className={cn("rounded-md px-2.5 py-1 font-medium uppercase", format === f ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <Textarea
              id={`${id}-data`}
              value={data}
              onChange={(e) => {
                setData(e.target.value);
                setFileName(null);
                changed();
              }}
              placeholder={format === "csv" ? "kind,source,question,answer,option_a,option_b,…" : '[{ "question": "…", "answer": "…" }]'}
              className="min-h-40 font-mono text-xs"
              lang="as"
              spellCheck={false}
            />
          </div>

          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Existing questions ({existing})</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ["append", "Add to them", "New questions go after the existing ones."],
                  ["replace", "Replace them", "Deletes every question in this chapter first."],
                ] as const
              ).map(([value, label, hint]) => (
                <label
                  key={value}
                  className={cn(
                    "flex cursor-pointer gap-3 rounded-xl border p-3 transition",
                    mode === value ? (value === "replace" ? "border-destructive/50 bg-destructive/5" : "border-primary/50 bg-primary/5") : "hover:bg-muted/50"
                  )}
                >
                  <input
                    type="radio"
                    name={`${id}-mode`}
                    value={value}
                    checked={mode === value}
                    onChange={() => {
                      setMode(value);
                      changed();
                    }}
                    className="mt-1 accent-[var(--primary)]"
                  />
                  <span>
                    <span className="block text-sm font-semibold">{label}</span>
                    <span className="block text-xs text-muted-foreground">{hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {error && (
            <Alert variant="destructive">
              <AlertTitle>Can&apos;t read this data</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter className="flex flex-col-reverse gap-2 border-t sm:flex-row sm:justify-end">
          <Button variant="outline" className={actionButton} disabled={!data.trim() || busy !== null} onClick={check}>
            {busy === "check" ? <Loader2Icon className="animate-spin" /> : <SearchCheckIcon />} Check
          </Button>
          <Button className={pressable} disabled={!preview || preview.summary.invalid > 0 || busy !== null} onClick={commit}>
            {busy === "import" && <Loader2Icon className="animate-spin" />}
            {preview ? `Import ${preview.summary.valid} question${preview.summary.valid === 1 ? "" : "s"}` : "Import"}
          </Button>
        </CardFooter>
      </Card>

      {preview && s && (
        <Card className={`${formCard} gap-0 py-0`}>
          <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
            <p className="mr-auto font-heading font-bold">Preview</p>
            <Badge variant="secondary">{s.total} rows</Badge>
            <Badge className="border-success/30 bg-success/10 text-success" variant="outline">
              {s.valid} ready
            </Badge>
            {s.invalid > 0 && (
              <Badge className="border-destructive/30 bg-destructive/10 text-destructive" variant="outline">
                {s.invalid} with problems
              </Badge>
            )}
            {s.willDelete > 0 && <Badge variant="outline">will delete {s.willDelete}</Badge>}
          </div>
          {s.invalid > 0 && (
            <p className="border-b bg-destructive/5 px-4 py-2 text-sm text-destructive">
              Fix the rows marked below in your file, then check again. Nothing is imported while any row has a problem.
            </p>
          )}
          <div className="max-h-[480px] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-card text-xs text-muted-foreground shadow-[0_1px_0_var(--border)]">
                <tr>
                  <th className="px-4 py-2 font-medium">Row</th>
                  <th className="px-2 py-2 font-medium">Type</th>
                  <th className="px-2 py-2 font-medium">Question / problem</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {preview.rows.map((r) => (
                  <tr key={r.row} className={cn(r.errors.length > 0 && "bg-destructive/5")}>
                    <td className="px-4 py-2 align-top tabular-nums text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        {r.errors.length ? <XCircleIcon className="size-4 text-destructive" /> : <CheckCircle2Icon className="size-4 text-success" />}
                        {r.row}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 align-top text-xs">
                      {r.preview ? (
                        <>
                          {r.preview.kind === "MCQ" ? `MCQ · ${r.preview.optionCount} options${r.preview.useInQuiz ? "" : " · practice only"}` : "Q&A"}
                          <span className="block text-muted-foreground">{r.preview.source === "EXTRA" ? "Extra" : "Textbook"}</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-2 py-2 align-top">
                      {r.preview && (
                        <span className="line-clamp-2" lang="as">
                          {plain(r.preview.question)}
                        </span>
                      )}
                      {r.errors.map((e) => (
                        <span key={e} className="block text-destructive">
                          {e}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
