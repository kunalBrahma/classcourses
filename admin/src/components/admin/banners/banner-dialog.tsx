"use client";

import { FormEvent, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlusIcon, Loader2Icon, TriangleAlertIcon, XIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Field } from "@/components/admin/settings/field";
import { inputClass, pressable } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";
import { MainPicture, PhonePicture, mainPictureWarning, phonePictureWarning, uploadMainPicture, uploadPhonePicture } from "@/lib/banner-image";
import { Banner, LinkForm, linkFormFrom, linkFromForm } from "@/lib/banners";
import { LinkPicker } from "./link-picker";

// A picture slot: shows the whole picture (never cropped) and uploads on pick.
function PictureSlot({ label, hint, src, busy, warning, onPick, onRemove }: {
  label: React.ReactNode;
  hint: string;
  src: string | null;
  busy: boolean;
  warning: string | null;
  onPick: (file: File) => void;
  onRemove?: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="grid gap-2">
      <span className="text-sm font-semibold">{label}</span>
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        aria-label={src ? "Change picture" : "Add a picture"}
        className="relative grid min-h-28 w-full place-items-center overflow-hidden rounded-xl border-2 border-dashed bg-muted/40 text-muted-foreground transition hover:border-primary/50 hover:bg-primary/5"
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- uploaded image on the public bucket
          <img src={src} alt="" className="max-h-44 w-full object-contain" />
        ) : (
          !busy && <ImagePlusIcon className="size-6" />
        )}
        {busy && (
          <span className="absolute inset-0 grid place-items-center bg-background/60">
            <Loader2Icon className="size-6 animate-spin" />
          </span>
        )}
      </button>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{hint}</p>
        {src && onRemove && (
          <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-destructive hover:text-destructive" onClick={onRemove}>
            <XIcon /> Remove
          </Button>
        )}
      </div>
      {warning && (
        <p className="flex items-start gap-1.5 text-xs text-warning">
          <TriangleAlertIcon className="mt-px size-3.5 shrink-0" /> {warning}
        </p>
      )}
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPick(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

export function BannerDialog({ target, onClose, onSaved }: {
  target: { item: Banner | null } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const id = useId();
  const [main, setMain] = useState<MainPicture | null>(null);
  const [phone, setPhone] = useState<PhonePicture | null>(null);
  const [altText, setAltText] = useState("");
  const [link, setLink] = useState<LinkForm>(linkFormFrom(null));
  const [isActive, setIsActive] = useState(true);
  const [uploadingMain, setUploadingMain] = useState(false);
  const [uploadingPhone, setUploadingPhone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [last, setLast] = useState<{ item: Banner | null } | null>(null);
  if (target !== last) {
    setLast(target);
    if (target) {
      const item = target.item;
      setMain(item ? { imageUrl: item.imageUrl, imageSmallUrl: item.imageSmallUrl, width: item.width, height: item.height } : null);
      setPhone(
        item?.mobileImageUrl && item.mobileWidth && item.mobileHeight
          ? { mobileImageUrl: item.mobileImageUrl, mobileWidth: item.mobileWidth, mobileHeight: item.mobileHeight }
          : null
      );
      setAltText(item?.altText ?? "");
      setLink(linkFormFrom(item?.link));
      setIsActive(item?.isActive ?? true);
      setError(null);
    }
  }

  const pickMain = async (file: File) => {
    setError(null);
    setUploadingMain(true);
    try {
      setMain(await uploadMainPicture(file));
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setUploadingMain(false);
    }
  };

  const pickPhone = async (file: File) => {
    setError(null);
    setUploadingPhone(true);
    try {
      setPhone(await uploadPhonePicture(file));
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setUploadingPhone(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!main) {
      setError("Add the main picture first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = {
        ...main,
        mobileImageUrl: phone?.mobileImageUrl ?? null,
        mobileWidth: phone?.mobileWidth ?? null,
        mobileHeight: phone?.mobileHeight ?? null,
        altText: altText.trim(),
        link: linkFromForm(link),
        isActive,
      };
      if (target?.item) await apiJson(`/api/admin/banners/${target.item.id}`, { method: "PATCH", json: body });
      else await apiJson("/api/admin/banners", { method: "POST", json: body });
      toast.success(target?.item ? "Banner saved" : "Banner added");
      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle className="font-heading">{target?.item ? "Edit banner" : "New banner"}</DialogTitle>
            <DialogDescription>Shown at the top of the home page. The whole picture is always visible, never cut off.</DialogDescription>
          </DialogHeader>
          <PictureSlot
            label="Main picture"
            hint="Landscape, 1920 × 640 looks best. PNG, JPG or WebP. It's resized for you."
            src={main?.imageUrl ?? null}
            busy={uploadingMain}
            warning={main ? mainPictureWarning(main.width, main.height) : null}
            onPick={(file) => void pickMain(file)}
          />
          <PictureSlot
            label={<>Phone picture <span className="font-normal text-muted-foreground">(optional)</span></>}
            hint="1080 × 540 looks best. Without one, phones show the main picture, smaller."
            src={phone?.mobileImageUrl ?? null}
            busy={uploadingPhone}
            warning={phone ? phonePictureWarning(phone.mobileWidth) : null}
            onPick={(file) => void pickPhone(file)}
            onRemove={() => setPhone(null)}
          />
          <Field
            id={`${id}-alt`}
            label={<>What does the banner say? <span className="font-normal text-muted-foreground">(optional)</span></>}
            hint="Read aloud to students who use a screen reader, and shown if the picture can't load."
          >
            <Input id={`${id}-alt`} className={inputClass} value={altText} onChange={(e) => setAltText(e.target.value)} lang="as" maxLength={160} />
          </Field>
          <LinkPicker value={link} onChange={setLink} />
          <label htmlFor={`${id}-on`} className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border bg-muted/40 px-4 py-3">
            <span className="text-sm font-semibold">Show on the home page</span>
            <Switch id={`${id}-on`} checked={isActive} onCheckedChange={setIsActive} />
          </label>
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <DialogFooter>
            <Button type="button" variant="outline" className="h-10" onClick={onClose}>Cancel</Button>
            <Button type="submit" className={pressable} disabled={busy || uploadingMain || uploadingPhone}>
              {busy && <Loader2Icon className="animate-spin" />} {target?.item ? "Save" : "Add banner"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
