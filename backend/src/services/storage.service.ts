import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "crypto";
import { AppError } from "../utils/AppError";
import { getSetting, StorageSettings } from "./settings.service";

// Cloudflare R2 via the S3-compatible API. Config is the admin-managed
// `storage` setting (settings.service.ts); R2_* env vars are the fallback.
// See CLAUDE.md → "File storage".
//
// Two buckets:
//   public  — `bucket`: images and other files safe to expose via publicUrl
//   private — `privateBucket`: premium notes, only ever served via signed URLs

export type StorageConfig = StorageSettings;
export type Visibility = "public" | "private";

let cachedClient: { fingerprint: string; client: S3Client } | undefined;

const buildClient = (config: Pick<StorageConfig, "endpoint" | "accessKeyId" | "secretAccessKey">) =>
  new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });

const getActive = async (visibility: Visibility) => {
  const config = await getSetting("storage");
  if (!config) {
    throw new AppError(503, "File storage is not configured. Set it in Admin → Settings → Storage.");
  }

  const bucket = visibility === "private" ? config.privateBucket : config.bucket;
  if (!bucket) {
    throw new AppError(
      503,
      "No private bucket is configured for premium files. Set it in Admin → Settings → Storage."
    );
  }

  // Rebuild the client whenever the saved credentials change — no restart needed.
  const fingerprint = `${config.endpoint}|${config.accessKeyId}|${config.secretAccessKey}`;
  if (!cachedClient || cachedClient.fingerprint !== fingerprint) {
    cachedClient?.client.destroy();
    cachedClient = { fingerprint, client: buildClient(config) };
  }
  return { config, bucket, client: cachedClient.client };
};

export const hasPrivateBucket = async () => Boolean((await getSetting("storage"))?.privateBucket);

// R2 answers HEAD requests with an empty body, so the SDK often reports
// "UnknownError" — translate status codes into something an admin can act on.
const describeStorageError = (err: unknown): string => {
  const e = err as { name?: string; message?: string; code?: string; $metadata?: { httpStatusCode?: number } };
  const status = e.$metadata?.httpStatusCode;
  if (status === 403) {
    return "Access denied (HTTP 403). Check the access key ID and secret, and that the token has access to this bucket.";
  }
  if (status === 404 || e.name === "NoSuchBucket" || e.name === "NotFound") {
    return "Bucket not found (HTTP 404). Check the bucket name.";
  }
  if (status === 400) {
    return `Bad request (HTTP 400): ${e.message ?? "check the endpoint and bucket name"}`;
  }
  if (e.code === "ENOTFOUND" || e.code === "ECONNREFUSED" || e.name === "TimeoutError") {
    return "Could not reach the endpoint. Check the endpoint URL.";
  }
  return `${e.name ?? "Error"}${status ? ` (HTTP ${status})` : ""}: ${e.message ?? "failed"}`;
};

export interface StorageTestResult {
  ok: boolean;
  steps: { name: string; ok: boolean; message?: string }[];
  latencyMs: number;
}

// Full round trip against a candidate config (not necessarily saved yet):
// for each configured bucket, reachable → write → read back → delete.
export const testStorageConfig = async (config: StorageConfig): Promise<StorageTestResult> => {
  const client = buildClient(config);
  const steps: StorageTestResult["steps"] = [];
  const started = Date.now();

  const run = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
      steps.push({ name, ok: true });
      return true;
    } catch (err) {
      steps.push({ name, ok: false, message: describeStorageError(err) });
      return false;
    }
  };

  const roundTrip = async (bucket: string, label: string) => {
    const key = `_healthcheck/${Date.now()}-${crypto.randomUUID()}.txt`;
    const body = "classcourse storage check";
    const prefix = label ? `${label}: ` : "";
    return (
      (await run(`${prefix}Bucket reachable`, async () => {
        await client.send(new HeadBucketCommand({ Bucket: bucket }));
      })) &&
      (await run(`${prefix}Upload`, async () => {
        await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: "text/plain" }));
      })) &&
      (await run(`${prefix}Download`, async () => {
        const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        const text = await res.Body?.transformToString();
        if (text !== body) throw new Error("Downloaded content did not match");
      })) &&
      (await run(`${prefix}Delete`, async () => {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      }))
    );
  };

  let ok: boolean;
  try {
    ok = await roundTrip(config.bucket, "");
    if (ok && config.privateBucket) {
      ok = await roundTrip(config.privateBucket, "Private bucket");
    }
  } finally {
    client.destroy();
  }

  return { ok, steps, latencyMs: Date.now() - started };
};

// ---- Operations used by the rest of the app ----
// `visibility` defaults to "public"; premium notes must always pass "private".

export const uploadObject = async (
  key: string,
  body: Buffer | string,
  contentType: string,
  visibility: Visibility = "public"
) => {
  const { bucket, client } = await getActive(visibility);
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
  return key;
};

export const deleteObject = async (key: string, visibility: Visibility = "public") => {
  const { bucket, client } = await getActive(visibility);
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
};

// `downloadName` makes the browser save the file under that name.
export const getSignedDownloadUrl = async (
  key: string,
  ttlSeconds?: number,
  visibility: Visibility = "public",
  opts: { downloadName?: string } = {}
) => {
  const { config, bucket, client } = await getActive(visibility);
  const disposition = opts.downloadName
    ? `attachment; filename="${opts.downloadName.replace(/[^\w.\- ]+/g, "_")}"; filename*=UTF-8''${encodeURIComponent(opts.downloadName)}`
    : undefined;
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: key, ResponseContentDisposition: disposition }),
    { expiresIn: ttlSeconds ?? config.signedUrlTtlSeconds }
  );
};

// Size + type of an uploaded object, or null if it doesn't exist.
export const headObject = async (key: string, visibility: Visibility = "public") => {
  const { bucket, client } = await getActive(visibility);
  try {
    const res = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return { size: res.ContentLength ?? 0, contentType: res.ContentType ?? null };
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404 || (err as { name?: string }).name === "NotFound") return null;
    throw err;
  }
};

// For large direct-from-browser uploads (admin PDF upload) without proxying through Express.
// Pass `contentLength` to sign the exact size: the upload is then rejected
// unless the browser sends exactly that many bytes (enforces size limits).
export const getSignedUploadUrl = async (
  key: string,
  contentType: string,
  ttlSeconds?: number,
  visibility: Visibility = "public",
  contentLength?: number
) => {
  const { config, bucket, client } = await getActive(visibility);
  return getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType, ContentLength: contentLength }),
    { expiresIn: ttlSeconds ?? config.signedUrlTtlSeconds, signableHeaders: new Set(["content-type", "content-length"]) }
  );
};

// Only for objects in the public bucket (images). Never use for premium notes.
export const getPublicUrl = async (key: string) => {
  const { config } = await getActive("public");
  if (!config.publicUrl) return null;
  return `${config.publicUrl}/${key}`;
};
