"use client";

import { useEffect, useId, useState } from "react";
import { ExternalLinkIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inputClass } from "@/components/admin/styles";
import { apiJson } from "@/lib/api";
import { LinkForm, LinkKind } from "@/lib/banners";
import { ClassLevel, Medium, SubjectRow, SubjectTree } from "@/lib/catalog";
import { siteLink } from "@/lib/site";
import { cn } from "@/lib/utils";

const KINDS: { kind: LinkKind; label: string }[] = [
  { kind: "none", label: "No link" },
  { kind: "site", label: "Page on this site" },
  { kind: "web", label: "Other website" },
];

const MAIN_PAGES = [
  { path: "/notes", label: "Notes" },
  { path: "/videos", label: "Videos" },
  { path: "/news", label: "News" },
  { path: "/blog", label: "Blog" },
  { path: "/about", label: "About Us" },
  { path: "/contact", label: "Contact Us" },
  { path: "/faq", label: "Questions & Answers" },
  { path: "/privacy", label: "Privacy Policy" },
  { path: "/terms", label: "Terms & Conditions" },
  { path: "/refund-policy", label: "Refund Policy" },
];
const CATALOG = "catalog";

const triggerClass = "h-10 w-full";

// One dropdown of the medium → class → subject → chapter chain.
function Level({ label, value, options, onChange, placeholder }: {
  label: string;
  value: string | undefined;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-xs font-semibold">{label}</Label>
      <Select value={value ?? ""} onValueChange={onChange} disabled={options.length === 0}>
        <SelectTrigger id={id} className={triggerClass}><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

// The path itself is the state: /medium/class/subject/chapter. Choosing a level
// drops everything after it, and stopping early links to that level's page.
function CatalogPicker({ path, onChange }: { path: string; onChange: (path: string) => void }) {
  const [mediumSlug, classSlug, subjectSlug, chapterSlug] = path.split("/").slice(1).filter(Boolean);
  const [mediums, setMediums] = useState<Medium[]>([]);
  const [classes, setClasses] = useState<ClassLevel[]>([]);
  const [subjects, setSubjects] = useState<{ key: string; list: SubjectRow[] } | null>(null);
  const [tree, setTree] = useState<SubjectTree | null>(null);

  useEffect(() => {
    apiJson<{ mediums: Medium[] }>("/api/admin/mediums").then(({ mediums }) => setMediums(mediums)).catch(() => undefined);
    apiJson<{ classes: ClassLevel[] }>("/api/admin/classes").then(({ classes }) => setClasses(classes)).catch(() => undefined);
  }, []);

  const medium = mediums.find((m) => m.slug === mediumSlug);
  const classLevel = classes.find((c) => c.slug === classSlug);
  const subjectsKey = medium && classLevel ? `${medium.id}/${classLevel.id}` : null;

  useEffect(() => {
    if (!subjectsKey) return;
    const [mediumId, classId] = subjectsKey.split("/");
    let live = true;
    apiJson<{ subjects: SubjectRow[] }>(`/api/admin/subjects?mediumId=${mediumId}&classId=${classId}`)
      .then(({ subjects }) => live && setSubjects({ key: subjectsKey, list: subjects }))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [subjectsKey]);

  const subjectList = subjects && subjects.key === subjectsKey ? subjects.list : [];
  const subject = subjectList.find((s) => s.slug === subjectSlug);
  const subjectId = subject?.id;

  useEffect(() => {
    if (!subjectId) return;
    let live = true;
    apiJson<{ subject: SubjectTree }>(`/api/admin/subjects/${subjectId}`)
      .then(({ subject }) => live && setTree(subject))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [subjectId]);

  const chapters = tree && tree.id === subjectId ? tree.chapters : [];
  const to = (...parts: string[]) => onChange(`/${parts.join("/")}`);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Level
        label="Medium"
        placeholder="Choose a medium"
        value={mediumSlug}
        options={mediums.filter((m) => m.isActive).map((m) => ({ value: m.slug, label: m.name }))}
        onChange={(m) => to(m)}
      />
      <Level
        label="Class"
        placeholder="Any class"
        value={classSlug}
        options={medium ? classes.filter((c) => c.isActive && (c.subjectsByMedium[medium.id] ?? 0) > 0).map((c) => ({ value: c.slug, label: c.name })) : []}
        onChange={(c) => to(mediumSlug, c)}
      />
      <Level
        label="Subject"
        placeholder="Any subject"
        value={subjectSlug}
        options={subjectList.filter((s) => s.isActive).map((s) => ({ value: s.slug, label: s.name }))}
        onChange={(s) => to(mediumSlug, classSlug, s)}
      />
      <Level
        label="Chapter"
        placeholder="Any chapter"
        value={chapterSlug}
        options={chapters.filter((c) => c.isPublished).map((c) => ({ value: c.slug, label: `Chapter ${c.number}: ${c.title}` }))}
        onChange={(c) => to(mediumSlug, classSlug, subjectSlug, c)}
      />
    </div>
  );
}

export function LinkPicker({ value, onChange }: { value: LinkForm; onChange: (next: LinkForm) => void }) {
  const id = useId();
  // Which entry the page dropdown shows. A link that isn't a main page is in the catalog.
  const [page, setPage] = useState(() => {
    if (!value.site) return "";
    return MAIN_PAGES.some((p) => p.path === value.site) ? value.site : CATALOG;
  });

  const choosePage = (next: string) => {
    setPage(next);
    onChange({ ...value, site: next === CATALOG ? "" : next });
  };

  return (
    <div className="grid gap-3">
      <span className="text-sm font-semibold" id={`${id}-label`}>When tapped, open</span>
      <div role="radiogroup" aria-labelledby={`${id}-label`} className="grid grid-cols-3 gap-1 rounded-xl border bg-muted/40 p-1">
        {KINDS.map(({ kind, label }) => (
          <button
            key={kind}
            type="button"
            role="radio"
            aria-checked={value.kind === kind}
            onClick={() => onChange({ ...value, kind })}
            className={cn(
              "min-h-10 rounded-lg px-2 text-xs font-semibold transition sm:text-sm",
              value.kind === kind ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {value.kind === "site" && (
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-page`} className="text-xs font-semibold">Page</Label>
            <Select value={page} onValueChange={choosePage}>
              <SelectTrigger id={`${id}-page`} className={triggerClass}><SelectValue placeholder="Choose a page" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={CATALOG}>A class, subject or chapter</SelectItem>
                {MAIN_PAGES.map((p) => <SelectItem key={p.path} value={p.path}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {page === CATALOG && <CatalogPicker path={value.site} onChange={(site) => onChange({ ...value, site })} />}
          {value.site && (
            <a href={siteLink(value.site)} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-1 text-xs font-semibold text-brand-amber-text hover:underline">
              View on site <ExternalLinkIcon className="size-3" />
            </a>
          )}
        </div>
      )}

      {value.kind === "web" && (
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-web`} className="text-xs font-semibold">Website link</Label>
          <Input
            id={`${id}-web`}
            className={inputClass}
            value={value.web}
            onChange={(e) => onChange({ ...value, web: e.target.value })}
            placeholder="https://…"
            inputMode="url"
            autoCapitalize="none"
            maxLength={500}
          />
          <p className="text-xs text-muted-foreground">Opens in a new tab.</p>
        </div>
      )}
    </div>
  );
}
