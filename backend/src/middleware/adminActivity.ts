import { NextFunction, Response } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../config/prisma";
import { AdminRequest } from "./role.middleware";

// The activity log (client requirements of 6 Nov 2026: "record every admin
// action — who, what, when and the reason — so nothing can be changed without
// a trace"). Mounted on /api/admin after requireAdmin: every request that
// changes something (POST/PUT/PATCH/DELETE) is written once its response is
// sent, successful or not. GET requests are written only when the handler
// asks (e.g. a data export). Handlers can add a plain-words action, target,
// summary and before/after through `noteActivity()`.

export interface ActivityNote {
  action?: string;
  targetType?: string;
  targetId?: string | null;
  summary?: string;
  reason?: string | null;
  before?: unknown;
  after?: unknown;
}

/** Adds detail to this request's activity-log entry (and logs a GET that wouldn't be). */
export const noteActivity = (res: Response, note: ActivityNote) => {
  res.locals.activity = { ...(res.locals.activity as ActivityNote | undefined), ...note };
};

// Never stored: anything that looks like a secret.
const SECRET_KEY = /(pass(word)?|secret|token|signature|credential|apikey|privatekey|accesskey(?!id))/i;
const MAX_STRING = 500;
const MAX_JSON = 8000;

const redact = (value: unknown, depth = 0): unknown => {
  if (depth > 6) return "[…]";
  if (typeof value === "string") return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}… (${value.length} characters)` : value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, SECRET_KEY.test(k) ? (v ? "[hidden]" : v) : redact(v, depth + 1)]));
  }
  return value;
};

const capped = (value: unknown): Prisma.InputJsonValue | undefined => {
  if (value === undefined) return undefined;
  const json = JSON.stringify(value);
  if (json.length <= MAX_JSON) return value as Prisma.InputJsonValue;
  return { note: `Too long to store in full (${json.length} characters)`, keys: value && typeof value === "object" ? Object.keys(value) : [] };
};

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const recordAdminActivity = (req: AdminRequest, res: Response, next: NextFunction) => {
  res.on("finish", () => {
    const note = res.locals.activity as ActivityNote | undefined;
    if (!req.admin || (!MUTATING.has(req.method) && !note)) return;
    const routePath = `${req.baseUrl.replace(/^\/api\/admin/, "")}${req.route?.path ?? req.path}`;
    const params = (req.params ?? {}) as Record<string, string>;
    const body = req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body) ? redact(req.body) : undefined;
    const reason = note?.reason ?? (typeof req.body?.reason === "string" ? req.body.reason : null);
    void prisma.adminActivity
      .create({
        data: {
          actorId: req.admin.id,
          actorEmail: req.admin.email,
          action: note?.action ?? `${req.method} ${routePath}`,
          method: req.method,
          path: req.originalUrl.split("?")[0].slice(0, 300),
          targetType: note?.targetType ?? routePath.split("/")[1] ?? null,
          targetId: note?.targetId ?? params.id ?? Object.values(params)[0] ?? null,
          summary: note?.summary ?? null,
          reason: reason ? String(reason).slice(0, 500) : null,
          details: capped({ ...(body !== undefined ? { request: body } : {}), ...(note?.before !== undefined ? { before: redact(note.before) } : {}), ...(note?.after !== undefined ? { after: redact(note.after) } : {}) }),
          statusCode: res.statusCode,
          ip: req.ip ?? null,
        },
      })
      .catch((err) => console.error("[activity] couldn't record an admin action:", (err as Error).message));
  });
  next();
};
