import crypto from "crypto";
import { ConsentStatus } from "@prisma/client";
import prisma from "../config/prisma";
import { AppError } from "../utils/AppError";
import { sendParentConsentEmail } from "../utils/mailer";
import { notifyUser } from "./notification.service";
import { ageOn, ADULT_AGE_YEARS } from "./profile.service";
import { requireSetting } from "./settings.service";

// Parent / guardian consent for students under 18 (client requirements of
// 6 Nov 2026; DPDP Act, verifiable parental consent). Every rule is here:
// who needs it, the emailed link, the parent's answer, the admin's record,
// and what a student may do meanwhile (fullAccess).
//
// Until consent is GRANTED a student under 18 can sign in and read free
// content, but can't take quizzes (no coins) or buy notes. A missing date of
// birth also blocks those (we can't tell whether consent is needed).

const RESEND_COOLDOWN_SECONDS = 60;
const hash = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

export const maskEmail = (email: string) => {
  const [local, domain] = email.split("@");
  // A fixed-length mask: the length of the name isn't revealed either
  return `${local.slice(0, 2)}•••@${domain}`;
};

interface StudentLike {
  id: string;
  role: string;
  dateOfBirth: Date | null;
}

/** Does this student need a parent's consent right now? */
export const needsConsent = async (u: Pick<StudentLike, "role" | "dateOfBirth">) => {
  if (u.role !== "STUDENT" || !u.dateOfBirth) return false;
  const { required } = await requireSetting("consent");
  return required && ageOn(u.dateOfBirth) < ADULT_AGE_YEARS;
};

export type AccessBlock = "NO_DATE_OF_BIRTH" | "CONSENT_REQUIRED" | null;

/**
 * What a student may do. `fullAccess` = quizzes, coins and purchases.
 * Admins always have it.
 */
export const accessState = async (userId: string) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, role: true, dateOfBirth: true, parentalConsent: true } });
  const required = await needsConsent(user);
  const consent = user.parentalConsent;
  let block: AccessBlock = null;
  if (user.role === "STUDENT" && !user.dateOfBirth) block = "NO_DATE_OF_BIRTH";
  else if (required && consent?.status !== "GRANTED") block = "CONSENT_REQUIRED";
  return {
    fullAccess: block === null,
    block,
    consent: {
      required,
      status: (consent?.status ?? "NONE") as ConsentStatus | "NONE",
      parentEmail: consent ? maskEmail(consent.parentEmail) : null,
      lastSentAt: consent?.lastSentAt ?? null,
      expired: consent?.status === "PENDING" ? consent.expiresAt <= new Date() : false,
      decidedAt: consent?.decidedAt ?? null,
    },
  };
};

const BLOCK_MESSAGE: Record<Exclude<AccessBlock, null>, string> = {
  NO_DATE_OF_BIRTH: "Please add your date of birth in your details first.",
  CONSENT_REQUIRED: "Your parent or guardian needs to give permission before you can take quizzes or buy notes. Check My profile to see how.",
};

/** Quizzes, coins and purchases: refused (403) until the student may use them. */
export const assertFullAccess = async (userId: string) => {
  const state = await accessState(userId);
  if (state.block) throw new AppError(403, BLOCK_MESSAGE[state.block], state.block);
};

// ---- The student asks a parent ------------------------------------------------

/** Emails the parent a link (replacing any earlier request). */
export const requestConsent = async (userId: string, parentEmailInput: string) => {
  const parentEmail = parentEmailInput.trim().toLowerCase();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, role: true, email: true, name: true, dateOfBirth: true, parentalConsent: true } });
  if (!(await needsConsent(user))) throw new AppError(400, "Your account doesn't need a parent's permission.");
  if (user.parentalConsent?.status === "GRANTED") throw new AppError(409, "Your parent or guardian has already given permission.");
  if (parentEmail === user.email.toLowerCase()) throw new AppError(400, "Use your parent's or guardian's own email, not yours.");
  const existing = user.parentalConsent;
  if (existing && existing.parentEmail === parentEmail && existing.status === "PENDING" && Date.now() - existing.lastSentAt.getTime() < RESEND_COOLDOWN_SECONDS * 1000) {
    throw new AppError(429, "We've just sent it. Please wait a minute before sending it again.", "CONSENT_RESEND_WAIT", {
      retryAfter: Math.ceil(RESEND_COOLDOWN_SECONDS - (Date.now() - existing.lastSentAt.getTime()) / 1000),
    });
  }

  const { linkValidDays } = await requireSetting("consent");
  const token = crypto.randomBytes(32).toString("base64url");
  const now = new Date();
  const data = {
    parentEmail,
    status: "PENDING" as const,
    tokenHash: hash(token),
    expiresAt: new Date(now.getTime() + linkValidDays * 86_400_000),
    lastSentAt: now,
    parentName: null,
    relationship: null,
    decidedAt: null,
    decidedVia: null,
    decidedIp: null,
    decidedUserAgent: null,
  };
  const saved = await prisma.parentalConsent.upsert({
    where: { userId },
    create: { userId, ...data },
    update: { ...data, sendCount: existing && existing.parentEmail === parentEmail ? { increment: 1 } : 1 },
  });
  // A new link replaces the old one; if the email fails, the old link is gone
  // too, which is fine: the student just tries again.
  await sendParentConsentEmail(parentEmail, user.name?.split(" ")[0] || "Your child", token, linkValidDays);
  return { parentEmail: maskEmail(saved.parentEmail), retryAfter: RESEND_COOLDOWN_SECONDS };
};

// ---- The parent answers --------------------------------------------------------

const byToken = async (token: string) => {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  return prisma.parentalConsent.findUnique({ where: { tokenHash: hash(token) }, include: { user: { select: { name: true, status: true } } } });
};

/** What the parent's page shows (no personal data beyond the first name). */
export const consentForParent = async (token: string) => {
  const consent = await byToken(token);
  if (!consent || consent.user.status === "DELETED") throw new AppError(404, "This link isn't valid. Ask your child to send a new one.", "CONSENT_LINK_INVALID");
  const site = await requireSetting("site");
  return {
    siteName: site.name,
    studentFirstName: consent.user.name?.split(" ")[0] || "Your child",
    status: consent.status,
    expired: consent.status === "PENDING" && consent.expiresAt <= new Date(),
    expiresAt: consent.expiresAt,
  };
};

export const decideConsent = async (
  token: string,
  input: { decision: "grant" | "decline"; parentName: string; relationship: "parent" | "guardian" },
  meta: { ip: string | null; userAgent: string | null }
) => {
  const consent = await byToken(token);
  if (!consent || consent.user.status === "DELETED") throw new AppError(404, "This link isn't valid. Ask your child to send a new one.", "CONSENT_LINK_INVALID");
  if (consent.status !== "PENDING") throw new AppError(409, "This request has already been answered.", "CONSENT_ALREADY_ANSWERED");
  if (consent.expiresAt <= new Date()) throw new AppError(410, "This link has expired. Ask your child to send a new one from their profile.", "CONSENT_LINK_EXPIRED");
  // Guarded on PENDING + token: two clicks can't both answer.
  const updated = await prisma.parentalConsent.updateMany({
    where: { id: consent.id, status: "PENDING", tokenHash: consent.tokenHash },
    data: {
      status: input.decision === "grant" ? "GRANTED" : "DECLINED",
      parentName: input.parentName,
      relationship: input.relationship,
      decidedAt: new Date(),
      decidedVia: "parent_link",
      decidedIp: meta.ip,
      decidedUserAgent: meta.userAgent?.slice(0, 300) ?? null,
      tokenHash: null, // used once
    },
  });
  if (updated.count === 0) throw new AppError(409, "This request has already been answered.", "CONSENT_ALREADY_ANSWERED");
  await notifyUser(consent.userId, {
    kind: "ACCOUNT",
    ...(input.decision === "grant"
      ? { title: "Your parent agreed", body: "Your parent or guardian gave permission. You can now take quizzes, earn coins and buy notes.", link: "/" }
      : { title: "Your parent didn't agree", body: "Your parent or guardian didn't give permission, so quizzes and buying notes stay off. You can still read every free chapter.", link: "/parent-consent" }),
  });
  return { status: input.decision === "grant" ? ("GRANTED" as const) : ("DECLINED" as const) };
};

// ---- The admin --------------------------------------------------------------------

/** Full record for the admin's user page. */
export const consentForAdmin = async (userId: string) => {
  const [state, consent] = await Promise.all([accessState(userId), prisma.parentalConsent.findUnique({ where: { userId } })]);
  const { tokenHash: _t, ...record } = consent ?? ({} as Partial<NonNullable<typeof consent>>);
  return { required: state.consent.required, fullAccess: state.fullAccess, block: state.block, record: consent ? record : null };
};

/** Consent given another way (e.g. the parent wrote to the Helpline). */
export const recordConsentByAdmin = async (userId: string, input: { parentEmail: string; parentName: string; relationship: "parent" | "guardian"; note: string }) => {
  const now = new Date();
  const before = await prisma.parentalConsent.findUnique({ where: { userId }, select: { status: true } });
  const data = {
    parentEmail: input.parentEmail.trim().toLowerCase(),
    parentName: input.parentName,
    relationship: input.relationship,
    status: "GRANTED" as const,
    tokenHash: null,
    decidedAt: now,
    decidedVia: "admin",
    decidedIp: null,
    decidedUserAgent: null,
    adminNote: input.note,
  };
  await prisma.parentalConsent.upsert({ where: { userId }, create: { userId, ...data, expiresAt: now, lastSentAt: now, sendCount: 0 }, update: data });
  return { before: { status: before?.status ?? "NONE" }, after: { status: "GRANTED" } };
};

/** The parent takes consent back: the account goes back to limited. */
export const withdrawConsentByAdmin = async (userId: string, note: string) => {
  const consent = await prisma.parentalConsent.findUnique({ where: { userId } });
  if (!consent || consent.status !== "GRANTED") throw new AppError(400, "There's no consent to withdraw");
  await prisma.parentalConsent.update({ where: { userId }, data: { status: "WITHDRAWN", adminNote: note, decidedAt: new Date(), decidedVia: "admin" } });
  return { before: { status: "GRANTED" }, after: { status: "WITHDRAWN" } };
};
