import { emailButton, emailLayout, escapeHtml } from "./layout";

export const passwordResetEmail = (opts: { siteName: string; resetUrl: string; expiresInMinutes: number }) => ({
  subject: `Reset your ${opts.siteName} password`,
  text: [
    `We received a request to reset your ${opts.siteName} password.`,
    `Open this link to choose a new password (valid for ${opts.expiresInMinutes} minutes):`,
    opts.resetUrl,
    "",
    "If you didn't ask for this, you can ignore this email — your password won't change.",
  ].join("\n"),
  html: emailLayout({
    siteName: opts.siteName,
    heading: "Reset your password",
    bodyHtml: `
      <p style="margin:0 0 12px;line-height:1.5;">We received a request to reset your ${escapeHtml(opts.siteName)} password.</p>
      ${emailButton(opts.resetUrl, "Choose a new password")}
      <p style="margin:0 0 12px;line-height:1.5;font-size:14px;color:#555;">This link is valid for ${opts.expiresInMinutes} minutes.</p>
      <p style="margin:0;line-height:1.5;font-size:14px;color:#555;">If you didn't ask for this, you can ignore this email — your password won't change.</p>
    `,
  }),
});
