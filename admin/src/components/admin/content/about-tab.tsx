"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { RichTextEditor } from "@/components/admin/editor/rich-text-editor";
import { formCard, pressable } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";

export function AboutTab({ chapterId, initial, onSaved }: { chapterId: string; initial: string | null; onSaved: (html: string | null) => void }) {
  const [html, setHtml] = useState(initial ?? "");
  const [saved, setSaved] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const dirty = html !== saved;

  const save = async () => {
    setBusy(true);
    try {
      const { chapter } = await apiJson<{ chapter: { aboutHtml: string | null } }>(`/api/admin/chapters/${chapterId}`, {
        method: "PATCH",
        json: { aboutHtml: html || null },
      });
      // Server-sanitised version is the source of truth.
      setSaved(chapter.aboutHtml ?? "");
      onSaved(chapter.aboutHtml);
      toast.success("About saved");
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className={formCard}>
      <CardHeader>
        <CardTitle className="font-heading text-lg">About the lesson</CardTitle>
        <CardDescription>Shown at the top of the chapter page — e.g. about the author or poet, or what the lesson covers.</CardDescription>
      </CardHeader>
      <CardContent>
        <RichTextEditor value={html} onChange={setHtml} ariaLabel="About the lesson" minHeight="14rem" placeholder="Write about the lesson or its author…" />
      </CardContent>
      <CardFooter className="flex items-center justify-between gap-3 border-t">
        <span className="text-xs text-muted-foreground">{dirty ? "Unsaved changes" : "All changes saved"}</span>
        <Button className={pressable} disabled={!dirty || busy} onClick={save}>
          {busy && <Loader2Icon className="animate-spin" />} Save
        </Button>
      </CardFooter>
    </Card>
  );
}
