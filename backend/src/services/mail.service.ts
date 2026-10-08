import nodemailer, { Transporter } from "nodemailer";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";
import { getSetting, SmtpSettings } from "./settings.service";

// SMTP email via nodemailer. Config is the admin-managed `smtp` setting
// (settings.service.ts); SMTP_* env vars are the fallback. When SMTP isn't
// configured at all, dev/test log the email to the console instead of failing.

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

let cachedTransport: { fingerprint: string; transport: Transporter } | undefined;

const buildTransport = (config: SmtpSettings) =>
  nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.password ?? "" } : undefined,
    // Fail fast on a wrong host/port instead of hanging the admin request.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

const fromHeader = (config: SmtpSettings) => ({ name: config.fromName, address: config.fromEmail });

export const sendMail = async (message: MailMessage) => {
  const config = await getSetting("smtp");

  if (!config) {
    if (env.NODE_ENV === "production") {
      throw new AppError(503, "Email is not configured. Set SMTP in Admin → Settings → Email.");
    }
    console.log(`[mail] SMTP not configured — would send to ${message.to}: "${message.subject}"\n${message.text}`);
    return;
  }

  const fingerprint = JSON.stringify([config.host, config.port, config.secure, config.user, config.password]);
  if (!cachedTransport || cachedTransport.fingerprint !== fingerprint) {
    cachedTransport?.transport.close();
    cachedTransport = { fingerprint, transport: buildTransport(config) };
  }

  await cachedTransport.transport.sendMail({
    from: fromHeader(config),
    replyTo: config.replyTo ?? undefined,
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text,
  });
};

// Turns nodemailer's error codes into something an admin can act on.
const describeSmtpError = (err: unknown): string => {
  const e = err as { code?: string; responseCode?: number; message?: string };
  switch (e.code) {
    case "EAUTH":
      return "Login rejected by the SMTP server. Check the username and password (Gmail/Outlook need an app password).";
    case "EDNS":
    case "ENOTFOUND":
      return "SMTP host not found. Check the host name.";
    case "ECONNECTION":
    case "ECONNREFUSED":
    case "ETIMEDOUT":
    case "ESOCKET":
      return `Could not connect to the SMTP server (${e.code}). Check the host, port and the "secure" setting (465 = secure on, 587 = off).`;
    case "EENVELOPE":
      return `The server rejected the sender or recipient: ${e.message ?? ""}`;
    default:
      return `${e.code ?? "Error"}${e.responseCode ? ` (${e.responseCode})` : ""}: ${e.message ?? "failed"}`;
  }
};

export interface SmtpTestResult {
  ok: boolean;
  steps: { name: string; ok: boolean; message?: string }[];
  latencyMs: number;
}

// Verifies a candidate config (not necessarily saved) and optionally sends a real test email.
export const testSmtpConfig = async (config: SmtpSettings, sendTo?: string): Promise<SmtpTestResult> => {
  const transport = buildTransport(config);
  const steps: SmtpTestResult["steps"] = [];
  const started = Date.now();

  try {
    try {
      await transport.verify();
      steps.push({ name: "Connect & sign in", ok: true });
    } catch (err) {
      steps.push({ name: "Connect & sign in", ok: false, message: describeSmtpError(err) });
      return { ok: false, steps, latencyMs: Date.now() - started };
    }

    if (sendTo) {
      try {
        await transport.sendMail({
          from: fromHeader(config),
          replyTo: config.replyTo ?? undefined,
          to: sendTo,
          subject: "Class Course — test email",
          text: "This is a test email from the Class Course admin panel. Your SMTP settings work.",
          html: "<p>This is a test email from the <strong>Class Course</strong> admin panel.</p><p>Your SMTP settings work.</p>",
        });
        steps.push({ name: `Send test email to ${sendTo}`, ok: true });
      } catch (err) {
        steps.push({ name: `Send test email to ${sendTo}`, ok: false, message: describeSmtpError(err) });
      }
    }
  } finally {
    transport.close();
  }

  return { ok: steps.every((s) => s.ok), steps, latencyMs: Date.now() - started };
};
