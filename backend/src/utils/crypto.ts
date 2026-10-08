import crypto from "crypto";
import { env } from "../config/env";

// AES-256-GCM for secrets persisted in the Setting table.
// Output format: "v1:<iv b64>:<auth tag b64>:<ciphertext b64>"
const ALGORITHM = "aes-256-gcm";
const key = Buffer.from(env.SETTINGS_ENCRYPTION_KEY, "hex");

export const encryptSecret = (plain: string): string => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
};

export const decryptSecret = (payload: string): string => {
  const [version, ivB64, tagB64, dataB64] = payload.split(":");
  if (version !== "v1" || !ivB64 || !tagB64 || !dataB64) {
    throw new Error("Unrecognised encrypted secret format");
  }
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
};

// "••••••••abcd" — enough for an admin to recognise which key is stored.
export const maskSecret = (plain: string): string =>
  plain.length <= 4 ? "••••" : `••••••••${plain.slice(-4)}`;
