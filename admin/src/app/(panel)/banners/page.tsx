"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { MoreHorizontalIcon, PencilIcon, PlusIcon, SmartphoneIcon, Trash2Icon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { BannerDialog } from "@/components/admin/banners/banner-dialog";
import { useConfirm } from "@/components/admin/confirm";
import { PageHeader } from "@/components/admin/page-header";
import { ReorderButtons } from "@/components/admin/reorder-buttons";
import { formCard, pressable } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";
import { Banner, bannerName, describeLink } from "@/lib/banners";
import { move } from "@/lib/catalog";
import { cn } from "@/lib/utils";

export default function BannersPage() {
  const confirm = useConfirm();
  const [items, setItems] = useState<Banner[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ item: Banner | null } | null>(null);

  const load = useCallback(
    () =>
      apiJson<{ items: Banner[] }>("/api/admin/banners")
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
      await apiJson("/api/admin/banners/reorder", { method: "PUT", json: { ids: next.map((i) => i.id) } });
    } catch (err) {
      toast.error((err as ApiError).message);
      void load();
    }
  };

  const setActive = async (item: Banner, isActive: boolean) => {
    setItems((list) => list?.map((i) => (i.id === item.id ? { ...i, isActive } : i)) ?? null);
    try {
      await apiJson(`/api/admin/banners/${item.id}`, { method: "PATCH", json: { isActive } });
    } catch (err) {
      toast.error((err as ApiError).message);
      void load();
    }
  };

  const remove = async (item: Banner, name: string) => {
    if (!(await confirm({ title: "Delete this banner?", description: `“${name}” will no longer appear on the home page.`, confirmLabel: "Delete", destructive: true }))) return;
    try {
      await apiJson(`/api/admin/banners/${item.id}`, { method: "DELETE" });
      toast.success("Deleted");
      void load();
    } catch (err) {
      toast.error((err as ApiError).message);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Home banners"
        description="Pictures at the top of the home page, above the coins. With more than one, they slide on their own, in this order. Switch one off to hide it. Changes can take a few minutes to reach the site."
        actions={<Button className={pressable} onClick={() => setDialog({ item: null })}><PlusIcon /> Add banner</Button>}
      />
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {!items && !error && <Skeleton className="h-64 rounded-2xl" />}
      {items && (
        <Card className={`${formCard} gap-0 py-0`}>
          <ol className="divide-y">
            {items.map((item, index) => (
              <li key={item.id} className={cn("flex items-center gap-2 px-2 py-3 sm:gap-3 sm:px-4", !item.isActive && "bg-muted/30")}>
                <ReorderButtons index={index} count={items.length} onMove={(d) => reorder(index, d)} label={bannerName(item, index)} />
                <span className="hidden w-32 shrink-0 overflow-hidden rounded-lg bg-muted sm:block">
                  {/* eslint-disable-next-line @next/next/no-img-element -- uploaded image on the public bucket */}
                  <img src={item.imageSmallUrl} alt="" width={item.width} height={item.height} className="h-auto w-full" />
                </span>
                <button type="button" onClick={() => setDialog({ item })} className="block min-w-0 flex-1 rounded-lg px-1 text-left hover:bg-muted/40">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold" lang="as">{bannerName(item, index)}</span>
                    {!item.isActive && <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning">Hidden</Badge>}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                    <span>{describeLink(item.link)}</span>
                    {item.mobileImageUrl && <span className="inline-flex items-center gap-1"><SmartphoneIcon className="size-3" /> Phone picture added</span>}
                  </span>
                </button>
                <Switch checked={item.isActive} onCheckedChange={(v) => setActive(item, v)} aria-label={`Show “${bannerName(item, index)}” on the home page`} />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-9" aria-label={`Actions for “${bannerName(item, index)}”`}><MoreHorizontalIcon /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setDialog({ item })}><PencilIcon /> Edit</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => remove(item, bannerName(item, index))}><Trash2Icon /> Delete</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
            {items.length === 0 && (
              <li className="px-4 py-12 text-center text-sm text-muted-foreground">
                No banners yet. Until you add one, the home page starts with the coins.
              </li>
            )}
          </ol>
        </Card>
      )}
      <BannerDialog target={dialog} onClose={() => setDialog(null)} onSaved={() => void load()} />
    </div>
  );
}
