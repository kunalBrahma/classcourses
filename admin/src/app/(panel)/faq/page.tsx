"use client";

import { FormEvent, useCallback, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2Icon, MoreHorizontalIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { RichTextEditor } from "@/components/admin/editor/rich-text-editor";
import { PageHeader } from "@/components/admin/page-header";
import { ReorderButtons } from "@/components/admin/reorder-buttons";
import { Field } from "@/components/admin/settings/field";
import { TokenMenu } from "@/components/admin/pages/token-menu";
import { useConfirm } from "@/components/admin/confirm";
import { formCard, inputClass, pressable } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";
import { move } from "@/lib/catalog";
import { toText } from "@/lib/content";
import { FaqItem, PublicSettings, renderTokens, TOKENS, tokenValues } from "@/lib/pages";
import { cn } from "@/lib/utils";

function FaqDialog({ target, values, onClose, onSaved }: {
  target: { item: FaqItem | null } | null;
  values: Record<string, string>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const id = useId();
  const questionRef = useRef<HTMLInputElement>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [isPublished, setIsPublished] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editorKey, setEditorKey] = useState(0);

  const [last, setLast] = useState<{ item: FaqItem | null } | null>(null);
  if (target !== last) {
    setLast(target);
    if (target) {
      setQuestion(target.item?.question ?? "");
      setAnswer(target.item?.answerHtml ?? "");
      setIsPublished(target.item?.isPublished ?? true);
      setError(null);
      setEditorKey((k) => k + 1);
    }
  }

  // The question is a plain input, so its "Insert value" adds the token at the cursor.
  const insertInQuestion = (name: string) => {
    const el = questionRef.current;
    const at = el?.selectionStart ?? question.length;
    const token = `{{${name}}}`;
    setQuestion((q) => q.slice(0, at) + token + q.slice(el?.selectionEnd ?? at));
    requestAnimationFrame(() => el?.focus());
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!toText(answer)) {
      setError("Write the answer.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = { question: question.trim(), answerHtml: answer, isPublished };
      if (target?.item) await apiJson(`/api/admin/faq/${target.item.id}`, { method: "PATCH", json: body });
      else await apiJson("/api/admin/faq", { method: "POST", json: body });
      toast.success(target?.item ? "FAQ saved" : "FAQ added");
      onSaved();
      onClose();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle className="font-heading">{target?.item ? "Edit question" : "New question"}</DialogTitle>
            <DialogDescription>Short, plain question — the way a student would ask it.</DialogDescription>
          </DialogHeader>
          <Field id={`${id}-q`} label="Question">
            <Input id={`${id}-q`} ref={questionRef} className={inputClass} value={question} onChange={(e) => setQuestion(e.target.value)} lang="as" minLength={3} maxLength={500} required autoFocus />
          </Field>
          <div className="-mt-3 flex flex-wrap gap-1.5">
            {TOKENS.filter((t) => t.name.startsWith("quiz.") || t.name === "site.name").map((t) => (
              <button key={t.name} type="button" onClick={() => insertInQuestion(t.name)} className="rounded-md border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground">
                + {t.label}
              </button>
            ))}
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-a`}>Answer</Label>
            <RichTextEditor
              key={editorKey}
              id={`${id}-a`}
              ariaLabel="Answer"
              compact
              minHeight="8rem"
              value={answer}
              onChange={setAnswer}
              toolbarExtra={(editor) => <TokenMenu editor={editor} values={values} />}
            />
          </div>
          <label htmlFor={`${id}-pub`} className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border bg-muted/40 px-4 py-3">
            <span className="text-sm font-semibold">Published</span>
            <Switch id={`${id}-pub`} checked={isPublished} onCheckedChange={setIsPublished} />
          </label>
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <DialogFooter>
            <Button type="button" variant="outline" className="h-10" onClick={onClose}>Cancel</Button>
            <Button type="submit" className={pressable} disabled={busy}>
              {busy && <Loader2Icon className="animate-spin" />} {target?.item ? "Save" : "Add question"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function FaqPage() {
  const confirm = useConfirm();
  const [items, setItems] = useState<FaqItem[] | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ item: FaqItem | null } | null>(null);

  const load = useCallback(
    () =>
      apiJson<{ items: FaqItem[] }>("/api/admin/faq")
        .then(({ items }) => setItems(items))
        .catch((err: ApiError) => setError(err.message)),
    []
  );
  useEffect(() => {
    void load();
    apiJson<{ settings: PublicSettings }>("/api/settings/public")
      .then(({ settings }) => setValues(tokenValues(settings)))
      .catch(() => setValues({}));
  }, [load]);

  const reorder = async (index: number, direction: -1 | 1) => {
    if (!items) return;
    const next = move(items, index, direction);
    setItems(next);
    try {
      await apiJson("/api/admin/faq/reorder", { method: "PUT", json: { ids: next.map((i) => i.id) } });
    } catch (err) {
      toast.error((err as ApiError).message);
      void load();
    }
  };

  const setPublished = async (targets: FaqItem[], isPublished: boolean) => {
    const ids = new Set(targets.map((t) => t.id));
    setItems((list) => list?.map((i) => (ids.has(i.id) ? { ...i, isPublished } : i)) ?? null);
    try {
      await Promise.all(targets.map((t) => apiJson(`/api/admin/faq/${t.id}`, { method: "PATCH", json: { isPublished } })));
      if (targets.length > 1) toast.success(`${targets.length} questions published`);
    } catch (err) {
      toast.error((err as ApiError).message);
      void load();
    }
  };

  const publishAll = async () => {
    const drafts = items?.filter((i) => !i.isPublished) ?? [];
    if (!drafts.length) return;
    if (await confirm({ title: `Publish all ${drafts.length} drafts?`, description: "Make sure the owner has approved the answers.", confirmLabel: "Publish all" })) {
      void setPublished(drafts, true);
    }
  };

  const remove = async (item: FaqItem) => {
    if (!(await confirm({ title: "Delete this question?", description: renderTokens(item.question, values, { html: false }), confirmLabel: "Delete", destructive: true }))) return;
    try {
      await apiJson(`/api/admin/faq/${item.id}`, { method: "DELETE" });
      toast.success("Deleted");
      void load();
    } catch (err) {
      toast.error((err as ApiError).message);
    }
  };

  const drafts = items?.filter((i) => !i.isPublished).length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="FAQ"
        description="Common questions, shown in this order on the student site's FAQ page."
        actions={
          <>
            {drafts > 0 && <Button variant="outline" className="h-10" onClick={publishAll}>Publish all ({drafts})</Button>}
            <Button className={pressable} onClick={() => setDialog({ item: null })}><PlusIcon /> Add question</Button>
          </>
        }
      />
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {!items && !error && <Skeleton className="h-96 rounded-2xl" />}
      {items && (
        <Card className={`${formCard} gap-0 py-0`}>
          <ol className="divide-y">
            {items.map((item, index) => (
              <li key={item.id} className={cn("flex items-start gap-2 px-2 py-3 sm:gap-3 sm:px-4", !item.isPublished && "bg-muted/30")}>
                <ReorderButtons index={index} count={items.length} onMove={(d) => reorder(index, d)} label={`question ${index + 1}`} />
                <button type="button" onClick={() => setDialog({ item })} className="min-w-0 flex-1 rounded-lg px-1 text-left hover:bg-muted/40">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold" lang="as">{renderTokens(item.question, values, { html: false })}</span>
                    {!item.isPublished && <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning">Draft</Badge>}
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground" lang="as">
                    {toText(renderTokens(item.answerHtml, values))}
                  </span>
                </button>
                <Switch className="mt-1" checked={item.isPublished} onCheckedChange={(v) => setPublished([item], v)} aria-label={`Question ${index + 1} published`} />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-9" aria-label={`Actions for question ${index + 1}`}><MoreHorizontalIcon /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setDialog({ item })}><PencilIcon /> Edit</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => remove(item)}><Trash2Icon /> Delete</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
            {items.length === 0 && <li className="px-4 py-12 text-center text-sm text-muted-foreground">No questions yet.</li>}
          </ol>
        </Card>
      )}
      <FaqDialog target={dialog} values={values} onClose={() => setDialog(null)} onSaved={() => void load()} />
    </div>
  );
}
