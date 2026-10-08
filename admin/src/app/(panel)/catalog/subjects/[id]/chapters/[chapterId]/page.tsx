"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeftIcon, ChevronLeftIcon, ChevronRightIcon, ExternalLinkIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AboutTab } from "@/components/admin/content/about-tab";
import { ImportTab } from "@/components/admin/content/import-tab";
import { QuestionDialog, QuestionDialogTarget } from "@/components/admin/content/question-dialog";
import { QuestionSection } from "@/components/admin/content/question-section";
import { VideosTab } from "@/components/admin/content/videos-tab";
import { ApiError, apiJson } from "@/lib/api";
import { siteLink } from "@/lib/site";
import { ChapterQuizPanel } from "@/components/admin/quiz-builder/chapter-quiz-panel";
import { SubjectTree } from "@/lib/catalog";
import { ChapterContent, Question, SECTIONS } from "@/lib/content";

const TABS = ["about", "qa", "mcq", "videos", "import"] as const;
type Tab = (typeof TABS)[number];

function ChapterEditor() {
  const { id: subjectId, chapterId } = useParams<{ id: string; chapterId: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab: Tab = (TABS as readonly string[]).includes(params.get("tab") ?? "") ? (params.get("tab") as Tab) : "qa";

  const [content, setContent] = useState<ChapterContent | null>(null);
  const [tree, setTree] = useState<SubjectTree | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<QuestionDialogTarget | null>(null);

  const load = useCallback(
    () =>
      apiJson<{ chapter: ChapterContent }>(`/api/admin/chapters/${chapterId}/content`)
        .then(({ chapter }) => setContent(chapter))
        .catch((err: ApiError) => setError(err.status === 404 ? "This chapter doesn't exist (it may have been deleted)." : err.message)),
    [chapterId]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    apiJson<{ subject: SubjectTree }>(`/api/admin/subjects/${subjectId}`)
      .then(({ subject }) => setTree(subject))
      .catch(() => setTree(null));
  }, [subjectId]);

  const setTab = (next: string) => {
    const q = new URLSearchParams(params.toString());
    q.set("tab", next);
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  };

  // Previous / next in the subject's reading order (the tree is already ordered).
  const { prev, next, position } = useMemo(() => {
    const list = tree?.chapters ?? [];
    const i = list.findIndex((c) => c.id === chapterId);
    return { prev: i > 0 ? list[i - 1] : null, next: i >= 0 && i < list.length - 1 ? list[i + 1] : null, position: i >= 0 ? `${i + 1} of ${list.length}` : null };
  }, [tree, chapterId]);

  const bySection = (source: string, kind: string) =>
    (content?.questions ?? []).filter((q) => q.source === source && q.kind === kind).sort((a, b) => a.order - b.order);
  const setQuestions = (update: (all: Question[]) => Question[]) =>
    setContent((c) => (c ? { ...c, questions: update(c.questions) } : c));

  if (error) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" className="-ml-2 h-9 px-2">
          <Link href={`/catalog/subjects/${subjectId}`}>
            <ArrowLeftIcon /> Back to subject
          </Link>
        </Button>
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t open this chapter</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!content) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-10 w-96 rounded-xl" />
        <Skeleton className="h-[420px] rounded-2xl" />
      </div>
    );
  }

  const qaCount = content.questions.filter((q) => q.kind === "QA").length;
  const mcqCount = content.questions.filter((q) => q.kind === "MCQ").length;
  const navHref = (cid: string) => `/catalog/subjects/${subjectId}/chapters/${cid}?tab=${tab}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost" className="-ml-2 h-9 min-w-0 px-2 text-muted-foreground">
          <Link href={`/catalog/subjects/${subjectId}`}>
            <ArrowLeftIcon />
            <span className="truncate">
              {content.subject.medium.name} · {content.subject.classLevel.name} · {content.subject.name}
            </span>
          </Link>
        </Button>
        <div className="flex items-center gap-1">
          {position && <span className="mr-1 text-xs text-muted-foreground tabular-nums">{position}</span>}
          <Button asChild={Boolean(prev)} variant="outline" size="icon" className="size-9" disabled={!prev} aria-label="Previous chapter">
            {prev ? (
              <Link href={navHref(prev.id)}>
                <ChevronLeftIcon />
              </Link>
            ) : (
              <ChevronLeftIcon />
            )}
          </Button>
          <Button asChild={Boolean(next)} variant="outline" size="icon" className="size-9" disabled={!next} aria-label="Next chapter">
            {next ? (
              <Link href={navHref(next.id)}>
                <ChevronRightIcon />
              </Link>
            ) : (
              <ChevronRightIcon />
            )}
          </Button>
        </div>
      </div>

      <div className="flex items-start gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-brand-navy font-heading text-xl font-bold text-white shadow-[0_4px_0_color-mix(in_oklch,var(--brand-navy),black_40%)]">
          {content.number}
        </span>
        <div className="min-w-0">
          <h1 className="font-heading text-2xl font-bold tracking-tight md:text-3xl" lang="as">
            {content.title}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {content.part && <span>{content.part.title}</span>}
            {content.isPublished ? (
              <a
                href={siteLink(`/${content.subject.medium.slug}/${content.subject.classLevel.slug}/${content.subject.slug}/${content.slug}`)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs hover:text-foreground hover:underline"
              >
                View on site <ExternalLinkIcon className="size-3" />
              </a>
            ) : (
              <Badge variant="outline">Unpublished</Badge>
            )}
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="about" className="h-9 px-3">About</TabsTrigger>
          <TabsTrigger value="qa" className="h-9 px-3">
            Q&amp;A <span className="ml-1 text-xs text-muted-foreground tabular-nums">{qaCount}</span>
          </TabsTrigger>
          <TabsTrigger value="mcq" className="h-9 px-3">
            MCQs <span className="ml-1 text-xs text-muted-foreground tabular-nums">{mcqCount}</span>
          </TabsTrigger>
          <TabsTrigger value="videos" className="h-9 px-3">
            Videos <span className="ml-1 text-xs text-muted-foreground tabular-nums">{content.videos.length}</span>
          </TabsTrigger>
          <TabsTrigger value="import" className="h-9 px-3">Import</TabsTrigger>
        </TabsList>

        <TabsContent value="about" className="mt-4">
          <AboutTab key={content.id} chapterId={content.id} initial={content.aboutHtml} onSaved={(aboutHtml) => setContent((c) => (c ? { ...c, aboutHtml } : c))} />
        </TabsContent>

        {(["qa", "mcq"] as const).map((t) => (
          <TabsContent key={t} value={t} className="mt-4 grid gap-6">
            {t === "mcq" && (
              <ChapterQuizPanel
                chapterId={content.id}
                refreshKey={content.questions.map((q) => `${q.id}${q.isPublished ? 1 : 0}${q.useInQuiz ? 1 : 0}`).join()}
              />
            )}
            {SECTIONS.filter((s) => (t === "qa" ? s.kind === "QA" : s.kind === "MCQ")).map((s) => (
              <QuestionSection
                key={`${s.source}-${s.kind}`}
                title={s.title}
                hint={s.hint}
                source={s.source}
                kind={s.kind}
                chapterId={content.id}
                questions={bySection(s.source, s.kind)}
                onAdd={() => setDialog({ source: s.source, kind: s.kind })}
                onEdit={(question) => setDialog({ question, source: question.source, kind: question.kind })}
                onChanged={() => void load()}
                setQuestions={setQuestions}
              />
            ))}
          </TabsContent>
        ))}

        <TabsContent value="videos" className="mt-4">
          <VideosTab
            chapterId={content.id}
            videos={content.videos}
            setVideos={(videos) => setContent((c) => (c ? { ...c, videos } : c))}
            onChanged={() => void load()}
          />
        </TabsContent>

        <TabsContent value="import" className="mt-4">
          <ImportTab
            chapterId={content.id}
            existing={content.questions.length}
            onImported={() => {
              void load();
              setTab("qa");
            }}
          />
        </TabsContent>
      </Tabs>

      <QuestionDialog target={dialog} chapterId={content.id} onClose={() => setDialog(null)} onSaved={() => void load()} />
    </div>
  );
}

export default function ChapterContentPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[600px] w-full rounded-2xl" />}>
      <ChapterEditor />
    </Suspense>
  );
}
