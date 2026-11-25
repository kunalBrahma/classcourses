import { emailLayout, escapeHtml } from "./layout";

// "Forgot password", "unlock my account" and "confirm my new sign-in email" codes (valid exactly 5 minutes).
const COPY = {
  RESET_PASSWORD: {
    heading: "Reset your password",
    subject: (code: string, site: string) => `${code} is your ${site} password reset code`,
    lead: (site: string) => `Enter this code on the ${site} “Forgot password” page to choose a new password:`,
    ignore: "If you didn't ask to reset your password, you can ignore this email. Your password stays the same.",
  },
  UNLOCK_ACCOUNT: {
    heading: "Unlock your account",
    subject: (code: string, site: string) => `${code} is your ${site} unlock code`,
    lead: (site: string) => `Your ${site} account was paused after several wrong passwords. Enter this code to sign in again now:`,
    ignore: "If this wasn't you, someone may be guessing your password: keep it secret, and change it if you're unsure.",
  },
  CHANGE_EMAIL: {
    heading: "Confirm your new sign-in email",
    subject: (code: string, site: string) => `${code} is your ${site} email change code`,
    lead: (site: string) => `Someone asked to use this address to sign in to ${site}. Enter this code on the “My account” page to confirm it:`,
    ignore: "If you didn't ask for this, you can ignore this email. Nothing changes until the code is entered.",
  },
} as const;

// Sent to the OLD address once the sign-in email has changed.
export const emailChangedEmail = (opts: { siteName: string; newEmail: string }) => {
  const lead = `The sign-in email of your ${opts.siteName} account was changed to ${opts.newEmail}.`;
  const tail = "If you didn't do this, contact your website support straight away.";
  return {
    subject: `Your ${opts.siteName} sign-in email was changed`,
    text: [lead, "", tail].join("\n"),
    html: emailLayout({
      siteName: opts.siteName,
      heading: "Your sign-in email was changed",
      bodyHtml: `
        <p style="margin:0 0 12px;line-height:1.5;">${escapeHtml(lead)}</p>
        <p style="margin:0;line-height:1.5;font-size:14px;color:#555;">${escapeHtml(tail)}</p>
      `,
    }),
  };
};

export const authCodeEmail = (opts: { purpose: keyof typeof COPY; siteName: string; code: string; expiresInMinutes: number }) => {
  const copy = COPY[opts.purpose];
  return {
    subject: copy.subject(opts.code, opts.siteName),
    text: [copy.lead(opts.siteName), "", opts.code, "", `The code works for ${opts.expiresInMinutes} minutes, and only once.`, "", copy.ignore].join("\n"),
    html: emailLayout({
      siteName: opts.siteName,
      heading: copy.heading,
      bodyHtml: `
        <p style="margin:0 0 12px;line-height:1.5;">${escapeHtml(copy.lead(opts.siteName))}</p>
        <p style="margin:16px 0;font-size:32px;font-weight:700;letter-spacing:8px;font-family:monospace;">${escapeHtml(opts.code)}</p>
        <p style="margin:0 0 12px;line-height:1.5;font-size:14px;color:#555;">The code works for ${opts.expiresInMinutes} minutes, and only once.</p>
        <p style="margin:0;line-height:1.5;font-size:14px;color:#555;">${escapeHtml(copy.ignore)}</p>
      `,
    }),
  };
};
