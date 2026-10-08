import { passwordResetEmail } from "../emails/passwordReset";
import { purchaseReceiptEmail } from "../emails/purchaseReceipt";
import { sendMail } from "../services/mail.service";
import { requireSetting } from "../services/settings.service";

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
