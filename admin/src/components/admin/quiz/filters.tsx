"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiJson } from "@/lib/api";
import { ClassLevel, Medium, SubjectRow } from "@/lib/catalog";
import { DATE_RANGES } from "@/lib/quiz";

const ALL = "__all";

// URL-backed filter state shared by the quiz pages.
export function useFilterParams() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const set = (next: Record<string, string | null>) => {
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === "" || v === ALL) q.delete(k);
      else q.set(k, v);
    }
    // Changing a filter returns to page 1; changing the page itself keeps it.
    if (!("page" in next)) q.delete("page");
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  };
  return { params, set };
}

// Date range + Medium → Class → Subject.
export function ScopeFilters({ defaultRange = "30d", showRange = true }: { defaultRange?: string; showRange?: boolean }) {
  const { params, set } = useFilterParams();
  const [mediums, setMediums] = useState<Medium[]>([]);
  const [classes, setClasses] = useState<ClassLevel[]>([]);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const mediumId = params.get("mediumId") ?? "";
  const classId = params.get("classId") ?? "";
  const subjectId = params.get("subjectId") ?? "";
  const range = params.get("range") ?? defaultRange;

  useEffect(() => {
    apiJson<{ mediums: Medium[] }>("/api/admin/mediums").then(({ mediums }) => setMediums(mediums)).catch(() => undefined);
    apiJson<{ classes: ClassLevel[] }>("/api/admin/classes").then(({ classes }) => setClasses(classes)).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!mediumId || !classId) return;
    apiJson<{ subjects: SubjectRow[] }>(`/api/admin/subjects?mediumId=${mediumId}&classId=${classId}`)
      .then(({ subjects }) => setSubjects(subjects.sort((a, b) => a.order - b.order)))
      .catch(() => setSubjects([]));
  }, [mediumId, classId]);

  const active = Boolean(mediumId || classId || subjectId || params.get("chapterId"));

  return (
    <div className="flex flex-wrap items-center gap-2">
      {showRange && (
        <Select value={range} onValueChange={(v) => set({ range: v })}>
          <SelectTrigger className="h-10 w-[150px]" aria-label="Date range"><SelectValue /></SelectTrigger>
          <SelectContent>{DATE_RANGES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
        </Select>
      )}
      <Select value={mediumId || ALL} onValueChange={(v) => set({ mediumId: v, subjectId: null, chapterId: null })}>
        <SelectTrigger className="h-10 w-[170px]" aria-label="Medium"><SelectValue placeholder="All mediums" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All mediums</SelectItem>
          {mediums.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={classId || ALL} onValueChange={(v) => set({ classId: v, subjectId: null, chapterId: null })}>
        <SelectTrigger className="h-10 w-[130px]" aria-label="Class"><SelectValue placeholder="All classes" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All classes</SelectItem>
          {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
        </SelectContent>
      </Select>
      {mediumId && classId && (
        <Select value={subjectId || ALL} onValueChange={(v) => set({ subjectId: v, chapterId: null })}>
          <SelectTrigger className="h-10 w-[190px]" aria-label="Subject"><SelectValue placeholder="All subjects" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All subjects</SelectItem>
            {subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      {active && (
        <Button variant="ghost" size="sm" className="h-10" onClick={() => set({ mediumId: null, classId: null, subjectId: null, chapterId: null })}>
          <XIcon /> Clear
        </Button>
      )}
    </div>
  );
}
