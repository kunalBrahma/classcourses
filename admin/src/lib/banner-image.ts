import { ApiError } from "@/lib/api";
import { uploadImage } from "@/lib/upload";

// Banners are shrunk and compressed in the browser before upload, so the admin can
// pick any large picture and students on phones never download a huge file.
// Only the size changes: the shape stays the same and nothing is cropped.
const SOURCE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const QUALITY = 0.85;

export const MAIN_MAX_WIDTH = 1920;
export const SMALL_MAX_WIDTH = 960;
export const PHONE_MAX_WIDTH = 1080;

const toBlob = (canvas: HTMLCanvasElement, type: string) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, QUALITY));

async function resize(source: ImageBitmap, maxWidth: number): Promise<{ file: File; width: number; height: number }> {
  const scale = Math.min(1, maxWidth / source.width); // never enlarged
  const width = Math.round(source.width * scale);
  const height = Math.max(1, Math.round(source.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ApiError(0, "This browser can't prepare the picture. Try another browser.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, width, height);

  let blob = await toBlob(canvas, "image/webp");
  // Safari can't write WebP and hands back a PNG instead: use JPEG, which has no
  // transparency, so transparent areas become white rather than black.
  if (blob?.type !== "image/webp") {
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    blob = await toBlob(canvas, "image/jpeg");
  }
  if (!blob) throw new ApiError(0, "Couldn't prepare the picture. Try another file.");
  const extension = blob.type === "image/webp" ? "webp" : "jpg";
  return { file: new File([blob], `banner.${extension}`, { type: blob.type }), width, height };
}

async function open(file: File): Promise<ImageBitmap> {
  if (!SOURCE_TYPES.includes(file.type)) throw new ApiError(400, "Use a PNG, JPG or WebP picture.");
  if (file.size > MAX_SOURCE_BYTES) throw new ApiError(400, "Pictures must be 20 MB or smaller.");
  try {
    return await createImageBitmap(file);
  } catch {
    throw new ApiError(400, "This file couldn't be opened as a picture. Try another file.");
  }
}

export interface MainPicture {
  imageUrl: string;
  imageSmallUrl: string;
  width: number;
  height: number;
}

export async function uploadMainPicture(file: File): Promise<MainPicture> {
  const source = await open(file);
  try {
    const main = await resize(source, MAIN_MAX_WIDTH);
    // A picture that is already small needs only one copy.
    if (source.width <= SMALL_MAX_WIDTH) {
      const url = await uploadImage(main.file);
      return { imageUrl: url, imageSmallUrl: url, width: main.width, height: main.height };
    }
    const small = await resize(source, SMALL_MAX_WIDTH);
    const [imageUrl, imageSmallUrl] = await Promise.all([uploadImage(main.file), uploadImage(small.file)]);
    return { imageUrl, imageSmallUrl, width: main.width, height: main.height };
  } finally {
    source.close();
  }
}

export interface PhonePicture {
  mobileImageUrl: string;
  mobileWidth: number;
  mobileHeight: number;
}

export async function uploadPhonePicture(file: File): Promise<PhonePicture> {
  const source = await open(file);
  try {
    const phone = await resize(source, PHONE_MAX_WIDTH);
    return { mobileImageUrl: await uploadImage(phone.file), mobileWidth: phone.width, mobileHeight: phone.height };
  } finally {
    source.close();
  }
}

// Advice only: the admin can still save.
export const mainPictureWarning = (width: number, height: number) => {
  if (width <= height) return "This picture isn't wide. A landscape picture works best here; add a phone picture below for tall designs.";
  if (width < 1200) return `This picture is only ${width} px wide, so it may look blurry on big screens.`;
  return null;
};

export const phonePictureWarning = (width: number) =>
  width < 600 ? `This picture is only ${width} px wide, so it may look blurry on phones.` : null;

export interface Picture {
  url: string;
  width: number;
  height: number;
}

// Blog featured images and announcement pictures: one copy, resized like banners.
export async function uploadPicture(file: File, maxWidth = 1600): Promise<Picture> {
  const source = await open(file);
  try {
    const picture = await resize(source, maxWidth);
    return { url: await uploadImage(picture.file), width: picture.width, height: picture.height };
  } finally {
    source.close();
  }
}
