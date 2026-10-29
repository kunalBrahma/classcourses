"use client";

import { FormEvent, useCallback, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { ExternalLinkIcon, ImageIcon, ImagePlusIcon, Loader2Icon, MoreHorizontalIcon, PencilIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/admin/page-header";
import { ReorderButtons } from "@/components/admin/reorder-buttons";
import { Field } from "@/components/admin/settings/field";
import { useConfirm } from "@/components/admin/confirm";
import { formCard, inputClass, pressable } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";
import { move } from "@/lib/catalog";
import { NewsLink } from "@/lib/pages";
import { uploadImage } from "@/lib/upload";
import { cn } from "@/lib/utils";

// Shown as the link text under the title, e.g. "indiatoday.in".
const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

function NewsDialog({ target, onClose, onSaved }: {
  target: { item: NewsLink | null } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const id = useId();
  const [source, setSource] = useState("");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [isActive, setIsActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [last, setLast] = useState<{ item: NewsLink | null } | null>(null);
  if (target !== last) {
    setLast(target);
    if (target) {
      setSource(target.item?.source ?? "");
      setTitle(target.item?.title ?? "");
      setUrl(target.item?.url ?? "");
      setImageUrl(target.item?.imageUrl ?? null);
      setIsActive(target.item?.isActive ?? true);
      setError(null);
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // A link pasted without https:// still works.
      const link = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
      const body = { source: source.trim(), title: title.trim(), url: link, imageUrl, isActive };
      if (target?.item) await apiJson(`/api/admin/news/${target.item.id}`, { method: "PATCH", json: body });
      else await apiJson("/api/admin/news", { method: "POST", json: body });
      toast.success(target?.item ? "News link saved" : "News link added");
      onSaved();
      onClose();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      setImageUrl(await uploadImage(file));
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle className="font-heading">{target?.item ? "Edit news link" : "New news link"}</DialogTitle>
            <DialogDescription>Students tap the card and the news site opens in a new tab.</DialogDescription>
          </DialogHeader>
          <Field id={`${id}-src`} label="Source" hint="The news site's name, e.g. India Today.">
            <Input id={`${id}-src`} className={inputClass} value={source} onChange={(e) => setSource(e.target.value)} maxLength={60} required autoFocus />
          </Field>
          <Field id={`${id}-title`} label="Title" hint="What students will find there, e.g. Education & school updates.">
            <Input id={`${id}-title`} className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} lang="as" maxLength={160} required />
          </Field>
          <Field id={`${id}-url`} label="Link">
            <Input
              id={`${id}-url`}
              className={inputClass}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              inputMode="url"
              autoCapitalize="none"
              maxLength={500}
              required
            />
          </Field>
          <div className="grid gap-2">
            <span className="text-sm font-semibold">Picture <span className="font-normal text-muted-foreground">(optional)</span></span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={uploading}
                className="relative grid aspect-video w-40 shrink-0 place-items-center overflow-hidden rounded-xl border-2 border-dashed bg-muted/40 text-muted-foreground transition hover:border-primary/50 hover:bg-primary/5"
                aria-label={imageUrl ? "Change picture" : "Add a picture"}
              >
                {imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- uploaded image on the public bucket
                  <img src={imageUrl} alt="" className="absolute inset-0 size-full object-cover" />
                ) : uploading ? (
                  <Loader2Icon className="size-6 animate-spin" />
                ) : (
                  <ImagePlusIcon className="size-6" />
                )}
                {imageUrl && uploading && <Loader2Icon className="absolute size-6 animate-spin text-white" />}
              </button>
              <div className="grid gap-1.5 text-xs text-muted-foreground">
                <span>Shown on the news card. A wide picture (16:9) looks best. PNG, JPG or WebP, up to 5 MB.</span>
                {imageUrl && (
                  <Button type="button" variant="ghost" size="sm" className="h-8 w-fit px-2 text-destructive hover:text-destructive" onClick={() => setImageUrl(null)}>
                    <XIcon /> Remove picture
                  </Button>
                )}
              </div>
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  void pickImage(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>
          </div>
          <label htmlFor={`${id}-on`} className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border bg-muted/40 px-4 py-3">
            <span className="text-sm font-semibold">Show on the home page</span>
            <Switch id={`${id}-on`} checked={isActive} onCheckedChange={setIsActive} />
          </label>
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <DialogFooter>
            <Button type="button" variant="outline" className="h-10" onClick={onClose}>Cancel</Button>
            <Button type="submit" className={pressable} disabled={busy || uploading}>
              {busy && <Loader2Icon className="animate-spin" />} {target?.item ? "Save" : "Add link"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function NewsPage() {
  const confirm = useConfirm();
  const [items, setItems] = useState<NewsLink[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ item: NewsLink | null } | null>(null);

  const load = useCallback(
    () =>
      apiJson<{ items: NewsLink[] }>("/api/admin/news")
        .then(({ items }) => setItems(items))
        .catch((err: ApiError) => setError(err.message)),
    []
  );
  useEffect(() => {
    void load();
  }, [load]);

  const reorder = async (index: number, direction: -1 | 1) => {
    if (!items) return;
    const next = move(items, index, direction);
    setItems(next);
    try {
      await apiJson("/api/admin/news/reorder", { method: "PUT", json: { ids: next.map((i) => i.id) } });
    } catch (err) {
      toast.error((err as ApiError).message);
      void load();
    }
  };

  const setActive = async (item: NewsLink, isActive: boolean) => {
    setItems((list) => list?.map((i) => (i.id === item.id ? { ...i, isActive } : i)) ?? null);
    try {
      await apiJson(`/api/admin/news/${item.id}`, { method: "PATCH", json: { isActive } });
    } catch (err) {
      toast.error((err as ApiError).message);
      void load();
    }
  };

  const remove = async (item: NewsLink) => {
    if (!(await confirm({ title: `Delete “${item.title}”?`, description: `${item.source} will no longer appear in Latest news.`, confirmLabel: "Delete", destructive: true }))) return;
    try {
      await apiJson(`/api/admin/news/${item.id}`, { method: "DELETE" });
      toast.success("Deleted");
      void load();
    } catch (err) {
      toast.error((err as ApiError).message);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="News links"
        description="The “Latest news” row on the home page and the News page. Each card opens the news site in a new tab. Shown in this order; switch one off to hide it."
        actions={<Button className={pressable} onClick={() => setDialog({ item: null })}><PlusIcon /> Add link</Button>}
      />
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {!items && !error && <Skeleton className="h-64 rounded-2xl" />}
      {items && (
        <Card className={`${formCard} gap-0 py-0`}>
          <ol className="divide-y">
            {items.map((item, index) => (
              <li key={item.id} className={cn("flex items-center gap-2 px-2 py-3 sm:gap-3 sm:px-4", !item.isActive && "bg-muted/30")}>
                <ReorderButtons index={index} count={items.length} onMove={(d) => reorder(index, d)} label={item.title} />
                <span className="hidden aspect-video w-20 shrink-0 overflow-hidden rounded-lg bg-muted sm:grid sm:place-items-center">
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- uploaded image on the public bucket
                    <img src={item.imageUrl} alt="" className="size-full object-cover" />
                  ) : (
                    <ImageIcon className="size-5 text-muted-foreground" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <button type="button" onClick={() => setDialog({ item })} className="block w-full rounded-lg px-1 text-left hover:bg-muted/40">
                    <span className="block text-xs font-bold uppercase tracking-wide text-brand-amber-text">{item.source}</span>
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold" lang="as">{item.title}</span>
                      {!item.isActive && <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning">Hidden</Badge>}
                    </span>
                  </button>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex max-w-full items-center gap-1 px-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <span className="truncate">{hostOf(item.url)}</span> <ExternalLinkIcon className="size-3 shrink-0" />
                  </a>
                </div>
                <Switch checked={item.isActive} onCheckedChange={(v) => setActive(item, v)} aria-label={`Show ${item.title} on the home page`} />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-9" aria-label={`Actions for ${item.title}`}><MoreHorizontalIcon /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setDialog({ item })}><PencilIcon /> Edit</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => remove(item)}><Trash2Icon /> Delete</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
            {items.length === 0 && (
              <li className="px-4 py-12 text-center text-sm text-muted-foreground">
                No news links yet. Until you add one, the site shows a few example news sites.
              </li>
            )}
          </ol>
        </Card>
      )}
      <NewsDialog target={dialog} onClose={() => setDialog(null)} onSaved={() => void load()} />
    </div>
  );
}
