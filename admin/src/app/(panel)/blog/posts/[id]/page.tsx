"use client";

import { FormEvent, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeftIcon, ChevronDownIcon, ExternalLinkIcon, ImagePlusIcon, Loader2Icon, Trash2Icon, XIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { LinkPreview } from "@/components/admin/catalog/link-preview";
import { useConfirm } from "@/components/admin/confirm";
import { RichTextEditor } from "@/components/admin/editor/rich-text-editor";
import { Field } from "@/components/admin/settings/field";
import { formCard, inputClass, pressable } from "@/components/admin/styles";
import { StatusBadge } from "@/components/admin/blog/status-badge";
import { ApiError, apiJson } from "@/lib/api";
import { uploadPicture } from "@/lib/banner-image";
import { slugify } from "@/lib/catalog";
import { BlogCategory, BlogPost, fromLocalInput, toLocalInput } from "@/lib/engagement";
import { siteLink } from "@/lib/site";

const NONE = "__none";

interface Form {
  title: string;
  slug: string;
  customSlug: boolean;
  categoryId: string | null;
  bodyHtml: string;
  excerpt: string;
  cover: { url: string; width: number; height: number } | null;
  coverAlt: string;
  publishedAt: string; // datetime-local
  seoTitle: string;
  seoDescription: string;
}

const emptyForm: Form = { title: "", slug: "", customSlug: false, categoryId: null, bodyHtml: "", excerpt: "", cover: null, coverAlt: "", publishedAt: "", seoTitle: "", seoDescription: "" };

const formFrom = (p: BlogPost): Form => ({
  title: p.title,
  slug: p.slug,
  customSlug: false,
  categoryId: p.categoryId,
  bodyHtml: p.bodyHtml,
  excerpt: p.excerpt,
  cover: p.coverImageUrl ? { url: p.coverImageUrl, width: p.coverWidth ?? 0, height: p.coverHeight ?? 0 } : null,
  coverAlt: p.coverAlt,
  publishedAt: toLocalInput(p.publishedAt),
  seoTitle: p.seoTitle ?? "",
  seoDescription: p.seoDescription ?? "",
});

// Blog → a post: write, add a featured image, pick a category, then save as a
// draft or publish (client requirements of 6 Nov 2026).
export default function BlogPostEditor() {
  const id = useId();
  const { id: postId } = useParams<{ id: string }>();
  const isNew = postId === "new";
  const router = useRouter();
  const confirm = useConfirm();
  const fileInput = useRef<HTMLInputElement>(null);
  const [post, setPost] = useState<BlogPost | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [categories, setCategories] = useState<BlogCategory[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "publish" | "unpublish" | "delete" | null>(null);
  const [uploading, setUploading] = useState(false);
  const [more, setMore] = useState(false);
  const [editorKey, setEditorKey] = useState(0);

  useEffect(() => {
    apiJson<{ categories: BlogCategory[] }>("/api/admin/blog/categories").then((r) => setCategories(r.categories)).catch(() => undefined);
    if (isNew) return;
    apiJson<{ post: BlogPost }>(`/api/admin/blog/posts/${postId}`)
      .then(({ post }) => {
        setPost(post);
        setForm(formFrom(post));
        setMore(Boolean(post.seoTitle || post.seoDescription || post.excerpt));
        setEditorKey((k) => k + 1);
      })
      .catch((err: ApiError) => setLoadError(err.message));
  }, [postId, isNew]);

  const update = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  const pickCover = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      update({ cover: await uploadPicture(file, 1600) });
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setUploading(false);
    }
  };

  const save = async (status?: "DRAFT" | "PUBLISHED") => {
    if (!form.title.trim()) {
      setError("Give the post a title.");
      return;
    }
    setBusy(status === "PUBLISHED" && post?.status !== "PUBLISHED" ? "publish" : status === "DRAFT" && post?.status === "PUBLISHED" ? "unpublish" : "save");
    setError(null);
    const body = {
      title: form.title.trim(),
      ...(form.customSlug && form.slug ? { slug: form.slug } : {}),
      categoryId: form.categoryId,
      bodyHtml: form.bodyHtml,
      excerpt: form.excerpt.trim(),
      coverImageUrl: form.cover?.url ?? null,
      coverWidth: form.cover?.width || null,
      coverHeight: form.cover?.height || null,
      coverAlt: form.coverAlt.trim(),
      seoTitle: form.seoTitle.trim() || null,
      seoDescription: form.seoDescription.trim() || null,
      ...(post?.status === "PUBLISHED" || status === "PUBLISHED" ? { publishedAt: fromLocalInput(form.publishedAt) } : {}),
      ...(status ? { status } : {}),
    };
    try {
      const res = isNew
        ? await apiJson<{ post: BlogPost }>("/api/admin/blog/posts", { method: "POST", json: body })
        : await apiJson<{ post: BlogPost }>(`/api/admin/blog/posts/${postId}`, { method: "PATCH", json: body });
      setPost(res.post);
      setForm(formFrom(res.post));
      toast.success(
        status === "PUBLISHED" && post?.status !== "PUBLISHED" ? "Published. It reaches the site within a few minutes." : status === "DRAFT" && post?.status === "PUBLISHED" ? "Unpublished. It's a draft again." : "Saved"
      );
      if (isNew) router.replace(`/blog/posts/${res.post.id}`);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!post || !(await confirm({ title: "Delete this post?", description: `“${post.title}” is removed from the site, with its likes and saves. This can't be undone.`, confirmLabel: "Delete", destructive: true }))) return;
    setBusy("delete");
    try {
      await apiJson(`/api/admin/blog/posts/${post.id}`, { method: "DELETE" });
      toast.success("Post deleted");
      router.replace("/blog/posts");
    } catch (err) {
      toast.error((err as ApiError).message);
      setBusy(null);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void save();
  };

  if (loadError) return <Alert variant="destructive"><AlertDescription>{loadError}</AlertDescription></Alert>;
  if (!isNew && !post) return <Skeleton className="h-96 rounded-2xl" />;

  const published = post?.status === "PUBLISHED";
  const slugValue = form.customSlug ? form.slug : post ? post.slug : slugify(form.title);

  return (
    <form onSubmit={submit} className="space-y-6">
      <Button asChild variant="ghost" className="-ml-2 h-9 px-2 text-muted-foreground">
        <Link href="/blog/posts"><ArrowLeftIcon /> All posts</Link>
      </Button>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl font-bold tracking-tight md:text-3xl">{isNew ? "New post" : "Edit post"}</h1>
          {post && <div className="mt-1.5"><StatusBadge post={post} /></div>}
        </div>
        <div className="flex flex-wrap gap-2">
          {published && (
            <Button asChild variant="outline" className="h-10">
              <a href={siteLink(`/blog/${post!.slug}`)} target="_blank" rel="noreferrer">View on site <ExternalLinkIcon /></a>
            </Button>
          )}
          <Button type="submit" variant="outline" className="h-10" disabled={busy !== null || uploading}>
            {busy === "save" && <Loader2Icon className="animate-spin" />} {published ? "Save changes" : "Save draft"}
          </Button>
          {!published && (
            <Button type="button" className={pressable} disabled={busy !== null || uploading} onClick={() => void save("PUBLISHED")}>
              {busy === "publish" && <Loader2Icon className="animate-spin" />} Publish
            </Button>
          )}
        </div>
      </div>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid min-w-0 content-start gap-6">
          <Card className={formCard}>
            <CardContent className="grid gap-5">
              <Field id={`${id}-title`} label="Title">
                <Input id={`${id}-title`} className="h-12 text-base font-semibold" value={form.title} onChange={(e) => update({ title: e.target.value })} maxLength={160} lang="as" placeholder="E.g. 5 ways to remember what you read" />
              </Field>
              <LinkPreview
                id={`${id}-slug`}
                prefix="/blog/"
                value={slugValue}
                editing={Boolean(post)}
                custom={form.customSlug}
                onCustom={(slug) => update(slug === null ? { customSlug: false, slug: "" } : { customSlug: true, slug })}
              />
              <div className="grid gap-2">
                <span className="text-sm font-semibold" id={`${id}-body-label`}>Text</span>
                <RichTextEditor key={editorKey} id={`${id}-body`} ariaLabel="Post text" value={form.bodyHtml} onChange={(html) => update({ bodyHtml: html })} minHeight="22rem" placeholder="Write the post. Use headings to split it into parts." />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid content-start gap-6">
          <Card className={formCard}>
            <CardHeader><CardTitle className="font-heading text-base">Featured image</CardTitle></CardHeader>
            <CardContent className="grid gap-3">
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={uploading}
                aria-label={form.cover ? "Change the featured image" : "Add a featured image"}
                className="relative grid aspect-video w-full place-items-center overflow-hidden rounded-xl border-2 border-dashed bg-muted/40 text-muted-foreground transition hover:border-primary/50"
              >
                {form.cover ? (
                  // eslint-disable-next-line @next/next/no-img-element -- uploaded image on the public bucket
                  <img src={form.cover.url} alt="" className="size-full object-cover" />
                ) : (
                  !uploading && <span className="grid justify-items-center gap-1 text-xs"><ImagePlusIcon className="size-6" /> Add a picture</span>
                )}
                {uploading && <span className="absolute inset-0 grid place-items-center bg-background/60"><Loader2Icon className="size-6 animate-spin" /></span>}
              </button>
              <p className="text-xs text-muted-foreground">Shown on the blog cards (cut to 16:9) and in full at the top of the post. Landscape, about 1600 × 900.</p>
              {form.cover && (
                <>
                  <Field id={`${id}-alt`} label="What the picture shows">
                    <Input id={`${id}-alt`} className={inputClass} value={form.coverAlt} onChange={(e) => update({ coverAlt: e.target.value })} maxLength={160} />
                  </Field>
                  <Button type="button" variant="ghost" size="sm" className="h-8 justify-self-start px-2 text-destructive hover:text-destructive" onClick={() => update({ cover: null, coverAlt: "" })}>
                    <XIcon /> Remove picture
                  </Button>
                </>
              )}
              <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickCover(f); e.target.value = ""; }} />
            </CardContent>
          </Card>

          <Card className={formCard}>
            <CardHeader><CardTitle className="font-heading text-base">Category</CardTitle></CardHeader>
            <CardContent className="grid gap-2">
              <Select value={form.categoryId ?? NONE} onValueChange={(v) => update({ categoryId: v === NONE ? null : v })}>
                <SelectTrigger aria-label="Category" className="h-10 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No category</SelectItem>
                  {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}{c.isActive ? "" : " (hidden)"}</SelectItem>)}
                </SelectContent>
              </Select>
              <Link href="/blog/categories" className="text-xs font-semibold text-brand-amber-text hover:underline">Add or change categories</Link>
            </CardContent>
          </Card>

          {published && (
            <Card className={formCard}>
              <CardHeader><CardTitle className="font-heading text-base">Publishing</CardTitle></CardHeader>
              <CardContent className="grid gap-3">
                <Field id={`${id}-date`} label="Publish date" hint="A later date keeps it off the site until then.">
                  <Input id={`${id}-date`} type="datetime-local" className={inputClass} value={form.publishedAt} onChange={(e) => update({ publishedAt: e.target.value })} />
                </Field>
                <Button type="button" variant="outline" className="h-10" disabled={busy !== null} onClick={() => void save("DRAFT")}>
                  {busy === "unpublish" && <Loader2Icon className="animate-spin" />} Unpublish (back to draft)
                </Button>
              </CardContent>
            </Card>
          )}

          <Card className={formCard}>
            <button type="button" onClick={() => setMore((m) => !m)} aria-expanded={more} className="flex w-full items-center justify-between px-6 text-left font-heading text-base font-semibold">
              More options <ChevronDownIcon className={`size-4 transition ${more ? "rotate-180" : ""}`} />
            </button>
            {more && (
              <CardContent className="grid gap-4">
                <Field id={`${id}-excerpt`} label="Short summary" hint="For the blog cards. Default: the first lines of the text.">
                  <Textarea id={`${id}-excerpt`} rows={3} maxLength={300} value={form.excerpt} onChange={(e) => update({ excerpt: e.target.value })} className="text-base" />
                </Field>
                <Field id={`${id}-seo-title`} label="Title in Google" hint={`Default: the post title. ${form.seoTitle.length}/70`}>
                  <Input id={`${id}-seo-title`} className={inputClass} value={form.seoTitle} maxLength={70} onChange={(e) => update({ seoTitle: e.target.value })} />
                </Field>
                <Field id={`${id}-seo-desc`} label="Description in Google" hint={`Default: the short summary. ${form.seoDescription.length}/160`}>
                  <Textarea id={`${id}-seo-desc`} rows={3} maxLength={160} value={form.seoDescription} onChange={(e) => update({ seoDescription: e.target.value })} className="text-base" />
                </Field>
              </CardContent>
            )}
          </Card>

          {post && (
            <Button type="button" variant="ghost" className="h-10 justify-self-start text-destructive hover:text-destructive" disabled={busy !== null} onClick={() => void remove()}>
              {busy === "delete" ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />} Delete post
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
