"use client";

import { FormEvent, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { Placeholder } from "@tiptap/extensions";
import { toast } from "sonner";
import {
  BoldIcon,
  Heading2Icon,
  Heading3Icon,
  ImageIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  Loader2Icon,
  QuoteIcon,
  Redo2Icon,
  RemoveFormattingIcon,
  SubscriptIcon,
  SuperscriptIcon,
  UnderlineIcon,
  Undo2Icon,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { uploadImage } from "@/lib/upload";
import { cn } from "@/lib/utils";

// Rich text for chapter About, answers and explanations. Produces HTML that
// the backend sanitises on save (same allowlist: no scripts/styles, absolute
// http(s) images only) — so the toolbar only offers what survives that.

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  ariaLabel: string;
  // Smaller toolbar (no headings/quote) for short fields like a question.
  compact?: boolean;
  minHeight?: string;
  id?: string;
  // Extra controls rendered at the end of the toolbar (e.g. "Insert value").
  toolbarExtra?: (editor: Editor) => React.ReactNode;
}

function ToolButton({
  icon: Icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className={cn("size-8 shrink-0", active && "bg-primary/10 text-primary hover:bg-primary/15")}
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()} // keep the editor's selection
      onClick={onClick}
    >
      <Icon />
    </Button>
  );
}

function LinkButton({ editor, active }: { editor: Editor; active: boolean }) {
  const [open, setOpen] = useState(false);
  const [href, setHref] = useState("");

  const apply = (e: FormEvent) => {
    e.preventDefault();
    const url = href.trim();
    const chain = editor.chain().focus().extendMarkRange("link");
    if (!url) chain.unsetLink().run();
    else chain.setLink({ href: /^(https?:|mailto:)/i.test(url) ? url : `https://${url}` }).run();
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setHref((editor.getAttributes("link").href as string | undefined) ?? "");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={cn("size-8 shrink-0", active && "bg-primary/10 text-primary")}
          aria-label="Link"
          title="Link"
          onMouseDown={(e) => e.preventDefault()}
        >
          <LinkIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72"
        align="start"
        // Keep typing in the editor after applying a link (Radix would focus the trigger).
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          editor.commands.focus();
        }}
      >
        <form onSubmit={apply} className="flex gap-2">
          <Input
            value={href}
            onChange={(e) => setHref(e.target.value)}
            placeholder="https://… (empty removes the link)"
            className="h-9"
            autoFocus
            inputMode="url"
            autoCapitalize="none"
          />
          <Button type="submit" className="h-9">
            Apply
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function Toolbar({ editor, compact, extra }: { editor: Editor; compact?: boolean; extra?: (editor: Editor) => React.ReactNode }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Re-render only when these change (Tiptap v3 recommendation).
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      subscript: e.isActive("subscript"),
      superscript: e.isActive("superscript"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      link: e.isActive("link"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const src = await uploadImage(file);
      editor.chain().focus().setImage({ src, alt: file.name.replace(/\.[^.]+$/, "") }).run();
      toast.success("Image added");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const c = () => editor.chain().focus();
  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="flex flex-wrap items-center gap-0.5 border-b bg-muted/40 px-1.5 py-1"
    >
      <ToolButton icon={BoldIcon} label="Bold" active={s.bold} onClick={() => c().toggleBold().run()} />
      <ToolButton icon={ItalicIcon} label="Italic" active={s.italic} onClick={() => c().toggleItalic().run()} />
      <ToolButton icon={UnderlineIcon} label="Underline" active={s.underline} onClick={() => c().toggleUnderline().run()} />
      <ToolButton icon={SubscriptIcon} label="Subscript (H₂O)" active={s.subscript} onClick={() => c().toggleSubscript().run()} />
      <ToolButton icon={SuperscriptIcon} label="Superscript (x²)" active={s.superscript} onClick={() => c().toggleSuperscript().run()} />
      <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
      {!compact && (
        <>
          <ToolButton icon={Heading2Icon} label="Heading" active={s.h2} onClick={() => c().toggleHeading({ level: 2 }).run()} />
          <ToolButton icon={Heading3Icon} label="Subheading" active={s.h3} onClick={() => c().toggleHeading({ level: 3 }).run()} />
        </>
      )}
      <ToolButton icon={ListIcon} label="Bullet list" active={s.bullet} onClick={() => c().toggleBulletList().run()} />
      <ToolButton icon={ListOrderedIcon} label="Numbered list" active={s.ordered} onClick={() => c().toggleOrderedList().run()} />
      {!compact && <ToolButton icon={QuoteIcon} label="Quote" active={s.quote} onClick={() => c().toggleBlockquote().run()} />}
      <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
      <LinkButton editor={editor} active={s.link} />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="size-8 shrink-0"
        aria-label="Insert image"
        title="Insert image (PNG, JPG, WebP, GIF · max 5 MB)"
        disabled={uploading}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => fileInput.current?.click()}
      >
        {uploading ? <Loader2Icon className="animate-spin" /> : <ImageIcon />}
      </Button>
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <ToolButton icon={RemoveFormattingIcon} label="Clear formatting" onClick={() => c().unsetAllMarks().clearNodes().run()} />
      {extra && (
        <>
          <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
          {extra(editor)}
        </>
      )}
      <span className="ml-auto flex">
        <ToolButton icon={Undo2Icon} label="Undo" disabled={!s.canUndo} onClick={() => c().undo().run()} />
        <ToolButton icon={Redo2Icon} label="Redo" disabled={!s.canRedo} onClick={() => c().redo().run()} />
      </span>
    </div>
  );
}

export function RichTextEditor({ value, onChange, placeholder, ariaLabel, compact, minHeight = "8rem", id, toolbarExtra }: Props) {
  const editor = useEditor({
    // Required with SSR: render on the client only.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        codeBlock: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: "https", protocols: ["http", "https", "mailto"] },
      }),
      Subscript,
      Superscript,
      Image.configure({ allowBase64: false }),
      Placeholder.configure({ placeholder: placeholder ?? "Write here…" }),
    ],
    content: value,
    editorProps: {
      attributes: {
        id: id ?? "",
        "aria-label": ariaLabel,
        "aria-multiline": "true",
        role: "textbox",
        class: "rich ProseMirror px-3.5 py-3 text-[15px]",
        style: `min-height:${minHeight}`,
      },
    },
    // Empty editor → "" (so required-field checks work), otherwise HTML.
    onUpdate: ({ editor: e }) => onChange(e.isEmpty ? "" : e.getHTML()),
  });

  return (
    <div className="overflow-hidden rounded-xl border bg-background focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30 dark:bg-input/20">
      {editor ? (
        <>
          <Toolbar editor={editor} compact={compact} extra={toolbarExtra} />
          <EditorContent editor={editor} />
        </>
      ) : (
        <div className="animate-pulse bg-muted/40" style={{ minHeight: `calc(${minHeight} + 2.5rem)` }} />
      )}
    </div>
  );
}

// Read-only display of stored (already sanitised) HTML.
export function RichView({ html, className }: { html: string | null | undefined; className?: string }) {
  if (!html) return null;
  // Safe: server-sanitised HTML (backend/src/utils/sanitizeHtml.ts).
  return <div className={cn("rich", className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
