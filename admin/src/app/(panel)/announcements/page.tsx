"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ImageIcon, MoreHorizontalIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { AnnouncementDialog } from "@/components/admin/announcements/announcement-dialog";
import { useConfirm } from "@/components/admin/confirm";
import { PageHeader } from "@/components/admin/page-header";
import { ReorderButtons } from "@/components/admin/reorder-buttons";
import { formCard, pressable } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";
import { move } from "@/lib/catalog";
import { Announcement, announcementState, audienceLabel, shortDate } from "@/lib/engagement";
import { cn } from "@/lib/utils";

// Announcements (client requirements of 6 Nov 2026): create, edit, publish,
// unpublish, remove, with text, a picture and who sees it.
export default function AnnouncementsPage() {
  const confirm = useConfirm();
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ item: Announcement | null } | null>(null);

  const load = useCallback(
    () =>
      apiJson<{ items: Announcement[] }>("/api/admin/announcements")
        .then((r) => setItems(r.items))
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
      await apiJson("/api/admin/announcements/reorder", { method: "PUT", json: { ids: next.map((i) => i.id) } });
    } catch (err) {
      toast.error((err as ApiError).message);
      void load();
    }
  };

  const setPublished = async (item: Announcement, isPublished: boolean) => {
    setItems((list) => list?.map((i) => (i.id === item.id ? { ...i, isPublished } : i)) ?? null);
    try {
      await apiJson(`/api/admin/announcements/${item.id}`, { method: "PATCH", json: { isPublished } });
      toast.success(isPublished ? "Published" : "Unpublished");
    } catch (err) {
      toast.error((err as ApiError).message);
      void load();
    }
  };

  const remove = async (item: Announcement) => {
    if (!(await confirm({ title: "Remove this announcement?", description: `“${item.title}” is deleted. To hide it for now, switch it off instead.`, confirmLabel: "Remove", destructive: true }))) return;
    try {
      await apiJson(`/api/admin/announcements/${item.id}`, { method: "DELETE" });
      toast.success("Removed");
      void load();
    } catch (err) {
      toast.error((err as ApiError).message);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Announcements"
        description="Short news on the home page: exam dates, new chapters, holidays. Shown in this order (new ones go first). Choose who sees each one and, if you like, when it starts and ends. Changes can take a few minutes to reach the site."
        actions={<Button className={pressable} onClick={() => setDialog({ item: null })}><PlusIcon /> New announcement</Button>}
      />
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {!items && !error && <Skeleton className="h-64 rounded-2xl" />}
      {items && (
        <Card className={cn(formCard, "gap-0 py-0")}>
          <ol className="divide-y">
            {items.map((item, index) => {
              const state = announcementState(item);
              return (
                <li key={item.id} className={cn("flex items-center gap-2 px-2 py-3 sm:gap-3 sm:px-4", !state.live && "bg-muted/30")}>
                  <ReorderButtons index={index} count={items.length} onMove={(d) => reorder(index, d)} label={item.title} />
                  <span className="hidden size-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted sm:grid">
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- uploaded image on the public bucket
                      <img src={item.imageUrl} alt="" className="size-full object-cover" />
                    ) : (
                      <ImageIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                    )}
                  </span>
                  <button type="button" onClick={() => setDialog({ item })} className="block min-w-0 flex-1 rounded-lg px-1 text-left hover:bg-muted/40">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold" lang="as">{item.title}</span>
                      <Badge variant="outline" className={state.live ? "border-success/30 bg-success/10 text-success" : "border-warning/40 bg-warning/10 text-warning"}>{state.label}</Badge>
                    </span>
                    <span className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                      <span>{audienceLabel(item)}</span>
                      {item.endsAt && state.live && <span>Until {shortDate(item.endsAt)}</span>}
                    </span>
                  </button>
                  <Switch checked={item.isPublished} onCheckedChange={(v) => void setPublished(item, v)} aria-label={`Publish “${item.title}”`} />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-9" aria-label={`Actions for “${item.title}”`}><MoreHorizontalIcon /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setDialog({ item })}><PencilIcon /> Edit</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => void remove(item)}><Trash2Icon /> Remove</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              );
            })}
            {items.length === 0 && <li className="px-4 py-12 text-center text-sm text-muted-foreground">No announcements yet. The home page simply leaves the section out until you add one.</li>}
          </ol>
        </Card>
      )}
      <AnnouncementDialog target={dialog} onClose={() => setDialog(null)} onSaved={() => void load()} />
    </div>
  );
}
