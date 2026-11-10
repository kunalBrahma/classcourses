"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeftIcon, CheckIcon, Loader2Icon, PencilIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useConfirm } from "@/components/admin/confirm";
import { PageHeader } from "@/components/admin/page-header";
import { ReorderButtons } from "@/components/admin/reorder-buttons";
import { formCard, inputClass, pressable } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";
import { move } from "@/lib/catalog";
import { BlogCategory } from "@/lib/engagement";
import { cn } from "@/lib/utils";

// Blog → Categories: the chips at the top of the site's Blog page.
export default function BlogCategoriesPage() {
  const confirm = useConfirm();
  const [items, setItems] = useState<BlogCategory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const load = useCallback(
    () =>
      apiJson<{ categories: BlogCategory[] }>("/api/admin/blog/categories")
        .then((r) => setItems(r.categories))
        .catch((err: ApiError) => setError(err.message)),
    []
  );
  useEffect(() => {
    void load();
  }, [load]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setAdding(true);
    try {
      await apiJson("/api/admin/blog/categories", { method: "POST", json: { name: name.trim() } });
      setName("");
      toast.success("Category added");
      void load();
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally {
      setAdding(false);
    }
  };

  const patch = async (item: BlogCategory, body: { name?: string; isActive?: boolean }) => {
    try {
      await apiJson(`/api/admin/blog/categories/${item.id}`, { method: "PATCH", json: body });
      if (body.name) toast.success("Renamed");
      setEditing(null);
      void load();
    } catch (err) {
      toast.error((err as ApiError).message);
    }
  };

  const reorder = async (index: number, direction: -1 | 1) => {
    if (!items) return;
    const next = move(items, index, direction);
    setItems(next);
    try {
      await apiJson("/api/admin/blog/categories/reorder", { method: "PUT", json: { ids: next.map((i) => i.id) } });
    } catch (err) {
      toast.error((err as ApiError).message);
      void load();
    }
  };

  const remove = async (item: BlogCategory) => {
    const posts = item._count.posts;
    if (!(await confirm({ title: `Delete “${item.name}”?`, description: posts ? `Its ${posts} post${posts === 1 ? "" : "s"} stay on the site, without a category.` : "No posts use it.", confirmLabel: "Delete", destructive: true }))) return;
    try {
      await apiJson(`/api/admin/blog/categories/${item.id}`, { method: "DELETE" });
      toast.success("Category deleted");
      void load();
    } catch (err) {
      toast.error((err as ApiError).message);
    }
  };

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" className="-ml-2 h-9 px-2 text-muted-foreground">
        <Link href="/blog/posts"><ArrowLeftIcon /> Blog posts</Link>
      </Button>
      <PageHeader title="Blog categories" description="Students filter the Blog by these, in this order. A category shows on the site once it has a published post. Switch one off to hide its chip; its posts stay visible." />

      <form onSubmit={add} className="flex gap-2 sm:max-w-md">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category, e.g. Exam tips" aria-label="New category name" maxLength={60} className={inputClass} />
        <Button type="submit" className={pressable} disabled={adding || !name.trim()}>
          {adding ? <Loader2Icon className="animate-spin" /> : <PlusIcon />} Add
        </Button>
      </form>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {!items && !error && <Skeleton className="h-48 rounded-2xl" />}
      {items && (
        <Card className={cn(formCard, "gap-0 py-0")}>
          <ol className="divide-y">
            {items.map((item, index) => (
              <li key={item.id} className={cn("flex items-center gap-2 px-2 py-3 sm:gap-3 sm:px-4", !item.isActive && "bg-muted/30")}>
                <ReorderButtons index={index} count={items.length} onMove={(d) => reorder(index, d)} label={item.name} />
                {editing?.id === item.id ? (
                  <form
                    className="flex min-w-0 flex-1 gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (editing.name.trim()) void patch(item, { name: editing.name.trim() });
                    }}
                  >
                    <Input autoFocus value={editing.name} onChange={(e) => setEditing({ id: item.id, name: e.target.value })} aria-label="Category name" maxLength={60} className={inputClass} />
                    <Button type="submit" size="icon" className="size-10" aria-label="Save name"><CheckIcon /></Button>
                    <Button type="button" variant="ghost" size="icon" className="size-10" aria-label="Cancel" onClick={() => setEditing(null)}><XIcon /></Button>
                  </form>
                ) : (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2 font-semibold">
                        {item.name}
                        {!item.isActive && <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning">Hidden</Badge>}
                      </span>
                      <span className="text-xs text-muted-foreground">{item._count.posts} post{item._count.posts === 1 ? "" : "s"}</span>
                    </span>
                    <Switch checked={item.isActive} onCheckedChange={(v) => void patch(item, { isActive: v })} aria-label={`Show “${item.name}” on the Blog page`} />
                    <Button variant="ghost" size="icon" className="size-9" aria-label={`Rename “${item.name}”`} onClick={() => setEditing({ id: item.id, name: item.name })}><PencilIcon /></Button>
                    <Button variant="ghost" size="icon" className="size-9 text-destructive hover:text-destructive" aria-label={`Delete “${item.name}”`} onClick={() => void remove(item)}><Trash2Icon /></Button>
                  </>
                )}
              </li>
            ))}
            {items.length === 0 && <li className="px-4 py-10 text-center text-sm text-muted-foreground">No categories yet. Posts work fine without them.</li>}
          </ol>
        </Card>
      )}
    </div>
  );
}
