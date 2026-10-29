import { emailLayout, escapeHtml } from "./layout";

export const verifyEmailCode = (opts: { siteName: string; name: string | null; code: string; expiresInMinutes: number }) => ({
  subject: `${opts.code} is your ${opts.siteName} code`,
  text: [
    `Hi${opts.name ? ` ${opts.name}` : ""},`,
    "",
    `Your ${opts.siteName} verification code is: ${opts.code}`,
    `Enter it on the sign-up page to finish creating your account. It works for ${opts.expiresInMinutes} minutes.`,
    "",
    "If you didn't sign up, you can ignore this email.",
  ].join("\n"),
  html: emailLayout({
    siteName: opts.siteName,
    heading: "Verify your email",
    bodyHtml: `
      <p style="margin:0 0 12px;line-height:1.5;">Hi${opts.name ? ` ${escapeHtml(opts.name)}` : ""}, enter this code to finish creating your ${escapeHtml(opts.siteName)} account:</p>
      <p style="margin:16px 0;font-size:32px;font-weight:700;letter-spacing:8px;font-family:monospace;">${escapeHtml(opts.code)}</p>
      <p style="margin:0 0 12px;line-height:1.5;font-size:14px;color:#555;">The code works for ${opts.expiresInMinutes} minutes.</p>
      <p style="margin:0;line-height:1.5;font-size:14px;color:#555;">If you didn't sign up, you can ignore this email.</p>
    `,
  }),
});
