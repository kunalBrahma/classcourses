import { passwordResetEmail } from "../emails/passwordReset";
import { purchaseReceiptEmail } from "../emails/purchaseReceipt";
import { verifyEmailCode } from "../emails/verifyEmail";
import { contactMessageEmail } from "../emails/contactMessage";
import { sendMail } from "../services/mail.service";
import { requireSetting } from "../services/settings.service";
import { AppError } from "./AppError";

// Thin, intention-named wrappers over the mail service so controllers don't
// build email content themselves. Delivery goes through the admin-configured
// SMTP (mail.service.ts); unconfigured SMTP logs to the console in dev.

// Never throws: forgot-password must respond identically whether or not the
// email exists, so a delivery failure is logged instead of surfacing as a 5xx.
export const sendPasswordResetEmail = async (email: string, token: string): Promise<void> => {
  try {
    const site = await requireSetting("site");
    const resetUrl = `${site.frontendUrl.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
    await sendMail({ to: email, ...passwordResetEmail({ siteName: site.name, resetUrl, expiresInMinutes: 60 }) });
  } catch (err) {
    console.error("[mail] Failed to send password reset email:", err instanceof Error ? err.message : err);
  }
};

// Never throws: the purchase is already complete; a failed email must not undo it.
export const sendPurchaseReceiptEmail = async (
  to: string,
  details: Omit<Parameters<typeof purchaseReceiptEmail>[0], "siteName" | "notesUrl">
): Promise<void> => {
  try {
    const site = await requireSetting("site");
    const notesUrl = `${site.frontendUrl.replace(/\/$/, "")}/profile/notes`;
    await sendMail({ to, ...purchaseReceiptEmail({ ...details, siteName: site.name, notesUrl }) });
  } catch (err) {
    console.error("[mail] Failed to send purchase receipt:", err instanceof Error ? err.message : err);
  }
};

// Throws (503): without the code the student can't finish signing up, so a
// failed send must be shown to them rather than silently logged.
export const sendVerificationCodeEmail = async (to: string, name: string | null, code: string, expiresInMinutes: number): Promise<void> => {
  const site = await requireSetting("site");
  try {
    await sendMail({ to, ...verifyEmailCode({ siteName: site.name, name, code, expiresInMinutes }) });
  } catch (err) {
    console.error("[mail] Failed to send verification code:", err instanceof Error ? err.message : err);
    throw new AppError(503, "We couldn't send the code email right now. Please try again in a minute.");
  }
};

// Tells the site's contact address about a new contact-form message (reply-to
// is the student). Throws on failure: the caller records the result.
export const sendContactNotificationEmail = async (msg: { name: string; email: string; phone: string | null; topic: string; message: string }) => {
  const [site, contact] = await Promise.all([requireSetting("site"), requireSetting("contact")]);
  await sendMail({ to: contact.email, replyTo: msg.email, ...contactMessageEmail({ siteName: site.name, ...msg }) });
};
