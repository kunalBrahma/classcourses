import { ApiError, apiJson } from "@/lib/api";

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// Uploads an image straight from the browser to the PUBLIC R2 bucket:
// backend signs a PUT for this exact type + size, browser uploads, we get the public URL.
export async function uploadImage(file: File): Promise<string> {
  if (!IMAGE_TYPES.includes(file.type)) throw new ApiError(400, "Use a PNG, JPG, WebP or GIF image.");
  if (file.size > MAX_IMAGE_BYTES) throw new ApiError(400, "Images must be 5 MB or smaller.");

  const { uploadUrl, headers, publicUrl } = await apiJson<{ uploadUrl: string; headers: Record<string, string>; publicUrl: string | null }>(
    "/api/admin/uploads/images",
    { method: "POST", json: { contentType: file.type, size: file.size } }
  );
  if (!publicUrl) throw new ApiError(400, "Set a Public URL in Settings → Storage first.");

  let res: Response;
  try {
    res = await fetch(uploadUrl, { method: "PUT", body: file, headers });
  } catch {
    // A browser-side network/CORS failure lands here (the bucket must allow PUT from this site).
    throw new ApiError(0, "Upload blocked by the storage bucket. Add the CORS policy shown in Settings → Storage, then try again.");
  }
  if (!res.ok) throw new ApiError(res.status, `Upload failed (${res.status}).`);
  return publicUrl;
}
