"use client";

import { FormEvent, useId, useState } from "react";
import { toast } from "sonner";
import { ExternalLinkIcon, Loader2Icon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ReorderButtons } from "@/components/admin/reorder-buttons";
import { Field } from "@/components/admin/settings/field";
import { useConfirm } from "@/components/admin/confirm";
import { formCard, inputClass, pressable } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";
import { move } from "@/lib/catalog";
import { Video } from "@/lib/content";

export function VideosTab({ chapterId, videos, setVideos, onChanged }: {
  chapterId: string;
  videos: Video[];
  setVideos: (v: Video[]) => void;
  onChanged: () => void;
}) {
  const id = useId();
  const confirm = useConfirm();
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await apiJson(`/api/admin/chapters/${chapterId}/videos`, { method: "POST", json: { url, title } });
      setUrl("");
      setTitle("");
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

  const rename = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    try {
      await apiJson(`/api/admin/videos/${editing.id}`, { method: "PATCH", json: { title: editing.title } });
      setEditing(null);
      onChanged();
    } catch (err) {
      toast.error((err as ApiError).message);
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
          <CardDescription>Paste any YouTube link — watch, youtu.be, Shorts or embed.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={add} className="grid gap-4 sm:grid-cols-[1.2fr_1fr_auto] sm:items-end">
            <Field id={`${id}-url`} label="YouTube link">
              <Input
                id={`${id}-url`}
                className={inputClass}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://youtu.be/…"
                inputMode="url"
                autoCapitalize="none"
                required
              />
            </Field>
            <Field id={`${id}-title`} label="Title">
              <Input id={`${id}-title`} className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} lang="as" required />
            </Field>
            <Button type="submit" className={pressable} disabled={busy}>
              {busy ? <Loader2Icon className="animate-spin" /> : <PlusIcon />} Add
            </Button>
          </form>
        </CardContent>
      </Card>

      {videos.length > 0 && (
        <Card className={`${formCard} gap-0 py-0`}>
          <ul className="divide-y">
            {videos.map((v, index) => (
              <li key={v.id} className="flex items-center gap-2 px-2 py-2.5 sm:gap-3 sm:px-4">
                <ReorderButtons index={index} count={videos.length} onMove={(d) => reorder(index, d)} label={v.title} />
                {/* eslint-disable-next-line @next/next/no-img-element -- YouTube thumbnail, external host */}
                <img
                  src={`https://i.ytimg.com/vi/${v.youtubeId}/mqdefault.jpg`}
                  alt=""
                  width={112}
                  height={63}
                  loading="lazy"
                  className="aspect-video w-24 shrink-0 rounded-lg bg-muted object-cover sm:w-28"
                />
                {editing?.id === v.id ? (
                  <form onSubmit={rename} className="flex min-w-0 flex-1 gap-2">
                    <Input
                      value={editing.title}
                      onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                      className="h-9"
                      autoFocus
                      aria-label="Video title"
                    />
                    <Button type="submit" size="sm" className="h-9">
                      Save
                    </Button>
                  </form>
                ) : (
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-medium" lang="as">
                      {v.title}
                    </p>
                    <a
                      href={`https://www.youtube.com/watch?v=${v.youtubeId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Open on YouTube <ExternalLinkIcon className="size-3" />
                    </a>
                  </div>
                )}
                <Button variant="ghost" size="icon" className="size-9" aria-label={`Rename ${v.title}`} onClick={() => setEditing({ id: v.id, title: v.title })}>
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
    </div>
  );
}
