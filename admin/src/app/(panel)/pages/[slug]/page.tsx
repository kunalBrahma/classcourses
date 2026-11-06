"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangleIcon, ArrowLeftIcon, CheckCircle2Icon, ExternalLinkIcon, FileTextIcon, Loader2Icon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RichTextEditor, RichView } from "@/components/admin/editor/rich-text-editor";
import { Field } from "@/components/admin/settings/field";
import { TokenMenu } from "@/components/admin/pages/token-menu";
import { useConfirm } from "@/components/admin/confirm";
import { actionButton, formCard, inputClass, pressable } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";
import { siteLink } from "@/lib/site";
import { formatDate } from "@/lib/people";
import { Page, PAGE_LABELS, PublicSettings, renderTokens, StandardPage, tokenValues, unknownTokens } from "@/lib/pages";

export default function PageEditor() {
  const { slug } = useParams<{ slug: string }>();
  const confirm = useConfirm();
  const [page, setPage] = useState<Page | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [standard, setStandard] = useState<StandardPage | null>(null);
  // Bumped to make the editor reload its content (it keeps its own copy).
  const [editorVersion, setEditorVersion] = useState(0);
  const [loadingStandard, setLoadingStandard] = useState(false);
  const label = PAGE_LABELS[slug];

  useEffect(() => {
    apiJson<{ page: Page }>(`/api/admin/pages/${slug}`)
      .then(({ page }) => {
        setPage(page);
        setTitle(page.title);
        setBody(page.bodyHtml);
      })
      .catch((err: ApiError) => setError(err.status === 404 ? "This page doesn't exist yet. Run the backend seed (npm run seed) to create the drafts." : err.message));
    apiJson<{ settings: PublicSettings }>("/api/settings/public")
      .then(({ settings }) => setValues(tokenValues(settings)))
      .catch(() => setValues({}));
    apiJson<StandardPage>(`/api/admin/pages/${slug}/standard`)
      .then(setStandard)
      .catch(() => setStandard(null));
  }, [slug]);

  // Fills the editor with the standard text. Nothing is saved until Save.
  const loadStandard = async () => {
    const ok = await confirm({
      title: label?.legal ? "Load the client's policy text?" : "Load the standard text?",
      description: "The title and content in the editor are replaced. Nothing changes on the site until you press Save.",
      confirmLabel: "Load text",
    });
    if (!ok) return;
    setLoadingStandard(true);
    try {
      const fresh = await apiJson<StandardPage>(`/api/admin/pages/${slug}/standard`);
      setTitle(fresh.standard.title);
      setBody(fresh.standard.bodyHtml);
      setEditorVersion((v) => v + 1);
      toast.success("Text loaded. Check it in Preview, then Save.");
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setLoadingStandard(false);
    }
  };
  const matchesStandard = standard !== null && title === standard.standard.title && body === standard.standard.bodyHtml;

  const dirty = page !== null && (title !== page.title || body !== page.bodyHtml);
  const typos = useMemo(() => [...new Set(unknownTokens(`${title} ${body}`))], [title, body]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = async (extra: { isPublished?: boolean } = {}) => {
    setBusy(true);
    setError(null);
    try {
      const { page: saved } = await apiJson<{ page: Page }>(`/api/admin/pages/${slug}`, {
        method: "PUT",
        json: { title: title.trim(), bodyHtml: body, ...extra },
      });
      setPage(saved);
      setTitle(saved.title);
      setBody(saved.bodyHtml);
      toast.success(extra.isPublished === true ? "Published" : extra.isPublished === false ? "Unpublished — now a draft" : "Saved");
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  const togglePublish = async (isPublished: boolean) => {
    const ok = await confirm(
      isPublished
        ? {
            title: `Publish “${title}”?`,
            description: label?.legal
              ? "Students will be able to read it, and it's linked from the footer and checkout. Make sure the owner (and ideally a lawyer) has approved this text."
              : "Students will be able to read it.",
            confirmLabel: "Publish",
          }
        : { title: `Unpublish “${title}”?`, description: "It disappears from the student site and its footer.", confirmLabel: "Unpublish", destructive: true }
    );
    if (ok) void save({ isPublished });
  };

  if (error && !page) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" className="-ml-2 h-9 px-2"><Link href="/pages"><ArrowLeftIcon /> All pages</Link></Button>
        <Alert variant="destructive"><AlertTitle>Couldn&apos;t open this page</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>
      </div>
    );
  }
  if (!page) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-[560px] rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" className="-ml-2 h-9 px-2 text-muted-foreground">
        <Link href="/pages"><ArrowLeftIcon /> All pages</Link>
      </Button>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 font-heading text-2xl font-bold tracking-tight md:text-3xl">
            {page.title}
            {page.isPublished ? (
              <Badge variant="outline" className="border-success/30 bg-success/10 text-success">Published</Badge>
            ) : (
              <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning">Draft</Badge>
            )}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {page.isPublished && (
              <>
                <a href={siteLink(`/${page.slug}`)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground hover:underline">
                  View on site <ExternalLinkIcon className="size-3" />
                </a>
                {" · "}
              </>
            )}
            Last updated {formatDate(page.updatedAt, true)}
          </p>
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-3 rounded-xl border bg-card px-4 py-2.5">
          <span className="text-sm font-semibold">{page.isPublished ? "Published" : "Publish"}</span>
          <Switch checked={page.isPublished} disabled={busy} onCheckedChange={togglePublish} aria-label="Published" />
        </label>
      </div>

      {standard && (
        <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
          {matchesStandard ? (
            <p className="flex items-start gap-2 text-sm">
              <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-success" />
              <span>{label?.legal ? "This page uses the client's own policy text." : "This page uses the standard text."}</span>
            </p>
          ) : (
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <FileTextIcon className="mt-0.5 size-4 shrink-0 text-brand-amber-text" />
              <span>
                {label?.legal
                  ? "The client's own policy text (requirements of 6 Nov 2026) is ready to use. Load it, check the preview, then save and publish."
                  : "A standard text is ready for this page."}
              </span>
            </p>
          )}
          {!matchesStandard && (
            <Button type="button" variant="outline" className={`${actionButton} shrink-0`} disabled={loadingStandard || busy} onClick={loadStandard}>
              {loadingStandard && <Loader2Icon className="animate-spin" />} Load the standard text
            </Button>
          )}
        </div>
      )}

      <Tabs defaultValue="edit">
        <TabsList>
          <TabsTrigger value="edit" className="h-9 px-4">Edit</TabsTrigger>
          <TabsTrigger value="preview" className="h-9 px-4">Preview</TabsTrigger>
        </TabsList>

        <TabsContent value="edit" className="mt-4">
          <Card className={formCard}>
            <CardContent className="grid gap-5">
              <Field id="page-title" label="Title">
                <Input id="page-title" className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
              </Field>
              <div className="grid gap-2">
                <span className="text-sm font-semibold">Content</span>
                <RichTextEditor
                  key={`${page.slug}-${editorVersion}`}
                  value={body}
                  onChange={setBody}
                  ariaLabel={`${page.title} content`}
                  minHeight="24rem"
                  toolbarExtra={(editor) => <TokenMenu editor={editor} values={values} />}
                />
                <p className="text-xs text-muted-foreground">
                  Values like <code className="rounded bg-muted px-1">{"{{quiz.secondsPerQuestion}}"}</code> are filled in from Settings when students view
                  the page — use <strong>Insert value</strong> so the text stays correct if you change the rules later.
                </p>
              </div>
              {typos.length > 0 && (
                <Alert className="border-warning/40 bg-warning/10">
                  <AlertTriangleIcon className="text-warning" />
                  <AlertTitle>Unknown value{typos.length > 1 ? "s" : ""}</AlertTitle>
                  <AlertDescription>
                    {typos.map((t) => `{{${t}}}`).join(", ")} won&apos;t be filled in — students would see it as written. Use Insert value instead.
                  </AlertDescription>
                </Alert>
              )}
              {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            </CardContent>
            <CardFooter className="flex items-center justify-between gap-3 border-t">
              <span className="text-xs text-muted-foreground">{dirty ? "Unsaved changes" : "All changes saved"}</span>
              <Button className={pressable} disabled={!dirty || busy || !title.trim()} onClick={() => save()}>
                {busy && <Loader2Icon className="animate-spin" />} Save
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="preview" className="mt-4">
          <Card className={formCard}>
            <CardContent>
              <p className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                As students will see it {dirty && "(including unsaved changes)"}
              </p>
              <h2 className="font-heading text-3xl font-bold tracking-tight">{renderTokens(title, values, { html: false })}</h2>
              {label?.legal && <p className="mt-1 text-sm text-muted-foreground">Last updated {formatDate(page.updatedAt)}</p>}
              <RichView html={renderTokens(body, values)} className="mt-6 text-[15px]" />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
