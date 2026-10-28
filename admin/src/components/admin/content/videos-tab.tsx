"use client";

import { FormEvent, useId, useState } from "react";
import { toast } from "sonner";
import { ExternalLinkIcon, HomeIcon, Loader2Icon, PencilIcon, PlayIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ReorderButtons } from "@/components/admin/reorder-buttons";
import { Field } from "@/components/admin/settings/field";
import { useConfirm } from "@/components/admin/confirm";
import { actionButton, formCard, inputClass, pressable } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";
import { move } from "@/lib/catalog";
import { parseYouTubeLink, Video, VIDEO_FORMATS, VideoFormat, youtubeThumb, youtubeWatchUrl } from "@/lib/content";
import { cn } from "@/lib/utils";

type VideoForm = { url: string; title: string; format: VideoFormat; formatTouched: boolean };
const EMPTY: VideoForm = { url: "", title: "", format: "LANDSCAPE", formatTouched: false };

// A pasted /shorts/ link switches the format to Short, unless the admin
// already picked one by hand.
const withUrl = (form: VideoForm, url: string): VideoForm => {
  const link = parseYouTubeLink(url);
  return { ...form, url, format: link && !form.formatTouched ? (link.isShort ? "SHORT" : "LANDSCAPE") : form.format };
};

export function VideosTab({ chapterId, videos, setVideos, onChanged }: {
  chapterId: string;
  videos: Video[];
  setVideos: (v: Video[]) => void;
  onChanged: () => void;
}) {
  const id = useId();
  const confirm = useConfirm();
  const [form, setForm] = useState<VideoForm>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Video | null>(null);
  const [watching, setWatching] = useState<Video | null>(null);
  const link = parseYouTubeLink(form.url);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await apiJson(`/api/admin/chapters/${chapterId}/videos`, {
        method: "POST",
        json: { url: form.url, title: form.title, format: form.format },
      });
      setForm(EMPTY);
      toast.success("Video added");
      onChanged();
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  const reorder = async (index: number, direction: -1 | 1) => {
    const next = move(videos, index, direction);
    setVideos(next);
    try {
      await apiJson(`/api/admin/chapters/${chapterId}/videos/reorder`, { method: "PUT", json: { ids: next.map((v) => v.id) } });
    } catch (err) {
      toast.error((err as ApiError).message);
      onChanged();
    }
  };

  // Optimistic: flip it now, put it back if the save fails.
  const toggleHome = async (v: Video) => {
    const featured = !v.featuredAt;
    setVideos(videos.map((x) => (x.id === v.id ? { ...x, featuredAt: featured ? new Date().toISOString() : null } : x)));
    try {
      await apiJson(`/api/admin/videos/${v.id}`, { method: "PATCH", json: { featured } });
      toast.success(featured ? "Shown on the home page" : "Removed from the home page");
    } catch (err) {
      toast.error((err as ApiError).message);
      onChanged();
    }
  };

  const remove = async (v: Video) => {
    if (!(await confirm({ title: `Remove “${v.title}”?`, description: "Only the link is removed; the video stays on YouTube.", confirmLabel: "Remove", destructive: true }))) return;
    try {
      await apiJson(`/api/admin/videos/${v.id}`, { method: "DELETE" });
      onChanged();
    } catch (err) {
      toast.error((err as ApiError).message);
    }
  };

  return (
    <div className="grid gap-6">
      <Card className={formCard}>
        <CardHeader>
          <CardTitle className="font-heading text-lg">Add a YouTube video</CardTitle>
          <CardDescription>
            Paste any YouTube link: a normal video, a Short, youtu.be or embed. Students watch it on the chapter page. Tap the house
            button on a video to also show it in the home page &ldquo;Videos&rdquo; row.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={add} className="grid gap-5 md:grid-cols-[1fr_auto]">
            <div className="grid content-start gap-4">
              <Field id={`${id}-url`} label="YouTube link">
                <Input
                  id={`${id}-url`}
                  className={inputClass}
                  value={form.url}
                  onChange={(e) => setForm((f) => withUrl(f, e.target.value))}
                  placeholder="https://youtu.be/… or https://youtube.com/shorts/…"
                  inputMode="url"
                  autoCapitalize="none"
                  aria-invalid={form.url.trim() !== "" && !link}
                  required
                />
              </Field>
              {form.url.trim() !== "" && !link && (
                <p className="-mt-2 text-sm text-destructive">That doesn&apos;t look like a YouTube link.</p>
              )}
              <Field id={`${id}-title`} label="Title">
                <Input
                  id={`${id}-title`}
                  className={inputClass}
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  lang="as"
                  required
                />
              </Field>
              <FormatPicker
                value={form.format}
                onChange={(format) => setForm((f) => ({ ...f, format, formatTouched: true }))}
                note={link?.isShort ? "Found a Shorts link, so Short is picked." : undefined}
              />
              <div>
                <Button type="submit" className={pressable} disabled={busy || !link}>
                  {busy ? <Loader2Icon className="animate-spin" /> : <PlusIcon />} Add video
                </Button>
              </div>
            </div>
            {link && <Thumb youtubeId={link.id} format={form.format} className="hidden md:block" size="lg" />}
          </form>
        </CardContent>
      </Card>

      {videos.length > 0 && (
        <Card className={`${formCard} gap-0 py-0`}>
          <ul className="divide-y">
            {videos.map((v, index) => (
              <li key={v.id} className="flex items-center gap-2 px-2 py-2.5 sm:gap-3 sm:px-4">
                <ReorderButtons index={index} count={videos.length} onMove={(d) => reorder(index, d)} label={v.title} />
                <button
                  type="button"
                  onClick={() => setWatching(v)}
                  aria-label={`Watch ${v.title}`}
                  className="group relative w-24 shrink-0 sm:w-28"
                >
                  <Thumb youtubeId={v.youtubeId} format={v.format} />
                  <span className="absolute inset-0 grid place-items-center">
                    <span className="grid size-8 place-items-center rounded-full bg-black/60 text-white transition group-hover:scale-110">
                      <PlayIcon className="size-4 fill-current" />
                    </span>
                  </span>
                </button>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-medium" lang="as">
                    {v.title}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <FormatBadge format={v.format} />
                    {v.featuredAt && (
                      <Badge variant="outline" className="border-success/40 bg-success/10 text-success">
                        On home page
                      </Badge>
                    )}
                    <a
                      href={youtubeWatchUrl(v)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground hover:text-foreground"
                    >
                      Open on YouTube <ExternalLinkIcon className="size-3" />
                    </a>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn("size-9", v.featuredAt ? "text-success" : "text-muted-foreground")}
                  aria-label={`Show ${v.title} on the home page`}
                  aria-pressed={!!v.featuredAt}
                  title={v.featuredAt ? "On the home page (tap to remove)" : "Show on the home page"}
                  onClick={() => toggleHome(v)}
                >
                  <HomeIcon />
                </Button>
                <Button variant="ghost" size="icon" className="size-9" aria-label={`Edit ${v.title}`} onClick={() => setEditing(v)}>
                  <PencilIcon />
                </Button>
                <Button variant="ghost" size="icon" className="size-9 text-destructive" aria-label={`Remove ${v.title}`} onClick={() => remove(v)}>
                  <Trash2Icon />
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <EditVideoDialog video={editing} onClose={() => setEditing(null)} onSaved={onChanged} />

      <Dialog open={watching !== null} onOpenChange={(open) => !open && setWatching(null)}>
        <DialogContent className={cn(watching?.format === "SHORT" ? "sm:max-w-sm" : "sm:max-w-3xl")}>
          <DialogHeader>
            <DialogTitle lang="as">{watching?.title}</DialogTitle>
            <DialogDescription>This is how it fits on the chapter page.</DialogDescription>
          </DialogHeader>
          {watching && (
            <div className={cn("mx-auto w-full overflow-hidden rounded-xl bg-black", watching.format === "SHORT" ? "aspect-[9/16] max-h-[70vh] w-auto" : "aspect-video")}>
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${watching.youtubeId}?rel=0`}
                title={watching.title}
                allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="size-full"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FormatPicker({ value, onChange, note }: { value: VideoFormat; onChange: (f: VideoFormat) => void; note?: string }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">Shape</legend>
      <div role="radiogroup" aria-label="Video shape" className="grid grid-cols-2 gap-2 sm:max-w-sm">
        {VIDEO_FORMATS.map((f) => {
          const active = value === f.value;
          return (
            <button
              key={f.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(f.value)}
              className={cn(
                "flex h-14 items-center gap-3 rounded-xl border px-3 text-left transition",
                active ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted"
              )}
            >
              <span
                aria-hidden
                className={cn("shrink-0 rounded-[3px] border-2", active ? "border-primary" : "border-muted-foreground/50", f.value === "SHORT" ? "h-6 w-3.5" : "h-3.5 w-6")}
              />
              <span>
                <span className="block text-sm font-medium">{f.label}</span>
                <span className="block text-xs text-muted-foreground">{f.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
      {note && <p className="mt-2 text-xs text-muted-foreground">{note}</p>}
    </fieldset>
  );
}

function FormatBadge({ format }: { format: VideoFormat }) {
  return (
    <Badge variant="secondary" className={cn(format === "SHORT" && "bg-brand-amber/15 text-amber-700 dark:text-amber-300")}>
      {format === "SHORT" ? "Short" : "Long video"}
    </Badge>
  );
}

function Thumb({ youtubeId, format, className, size }: { youtubeId: string; format: VideoFormat; className?: string; size?: "lg" }) {
  // Always a 16:9 box so rows line up; a Short shows as a tall image inside it.
  return (
    <div className={cn("relative aspect-video overflow-hidden rounded-lg bg-muted", size === "lg" && "w-64", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- YouTube thumbnail, external host */}
      <img
        src={youtubeThumb(youtubeId)}
        alt=""
        loading="lazy"
        className={cn(
          "absolute object-cover",
          format === "SHORT" ? "inset-y-0 left-1/2 aspect-[9/16] h-full -translate-x-1/2" : "inset-0 size-full"
        )}
      />
    </div>
  );
}

function EditVideoDialog({ video, onClose, onSaved }: { video: Video | null; onClose: () => void; onSaved: () => void }) {
  const id = useId();
  const [form, setForm] = useState<VideoForm>(EMPTY);
  const [busy, setBusy] = useState(false);
  // Reset the form when a different video is opened ("previous target" pattern).
  const [prev, setPrev] = useState<Video | null>(null);
  if (video !== prev) {
    setPrev(video);
    if (video) setForm({ url: youtubeWatchUrl(video), title: video.title, format: video.format, formatTouched: true });
  }
  const link = parseYouTubeLink(form.url);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!video) return;
    setBusy(true);
    try {
      await apiJson(`/api/admin/videos/${video.id}`, {
        method: "PATCH",
        json: { title: form.title, url: form.url, format: form.format },
      });
      toast.success("Video saved");
      onClose();
      onSaved();
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={video !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={save} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Edit video</DialogTitle>
            <DialogDescription>Change the title, swap the link, or fix the shape.</DialogDescription>
          </DialogHeader>
          <Field id={`${id}-title`} label="Title">
            <Input id={`${id}-title`} className={inputClass} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} lang="as" required />
          </Field>
          <Field id={`${id}-url`} label="YouTube link">
            <Input
              id={`${id}-url`}
              className={inputClass}
              value={form.url}
              onChange={(e) => setForm((f) => withUrl({ ...f, formatTouched: false }, e.target.value))}
              inputMode="url"
              autoCapitalize="none"
              aria-invalid={!link}
              required
            />
          </Field>
          {!link && <p className="-mt-2 text-sm text-destructive">That doesn&apos;t look like a YouTube link.</p>}
          <FormatPicker value={form.format} onChange={(format) => setForm((f) => ({ ...f, format, formatTouched: true }))} />
          <DialogFooter>
            <Button type="button" variant="outline" className={actionButton} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className={pressable} disabled={busy || !link}>
              {busy && <Loader2Icon className="animate-spin" />} Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
