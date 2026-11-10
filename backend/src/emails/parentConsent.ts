import { emailButton, emailLayout, escapeHtml } from "./layout";

// To a parent or guardian: their child under 18 signed up and needs their
// permission (client requirements of 6 Nov 2026; DPDP Act).
export const parentConsentEmail = (opts: { siteName: string; studentName: string; link: string; validDays: number; privacyUrl: string }) => ({
  subject: `${opts.studentName} asks your permission to use ${opts.siteName}`,
  text: [
    "Hello,",
    "",
    `${opts.studentName} has signed up to ${opts.siteName}, a study website for school students in Assam, and gave your email as their parent or guardian.`,
    "Because they are under 18, we need your permission before their account is fully active (quizzes, coins and buying notes).",
    "",
    `Read what we store and why, and give or refuse permission here (the link works for ${opts.validDays} days):`,
    opts.link,
    "",
    `Privacy Policy: ${opts.privacyUrl}`,
    "",
    "If you don't know this student, you can ignore this email: nothing changes until you answer.",
  ].join("\n"),
  html: emailLayout({
    siteName: opts.siteName,
    heading: "Your permission is needed",
    bodyHtml: `
      <p style="margin:0 0 12px;line-height:1.5;">Hello,</p>
      <p style="margin:0 0 12px;line-height:1.5;"><strong>${escapeHtml(opts.studentName)}</strong> has signed up to ${escapeHtml(opts.siteName)}, a study website for school students in Assam, and gave your email as their parent or guardian.</p>
      <p style="margin:0 0 16px;line-height:1.5;">Because they are under 18, we need your permission before their account is fully active (quizzes, coins and buying notes).</p>
      ${emailButton(opts.link, "Read and answer")}
      <p style="margin:16px 0 12px;line-height:1.5;font-size:14px;color:#555;">The link works for ${opts.validDays} days. You can also read our <a href="${escapeHtml(opts.privacyUrl)}">Privacy Policy</a>.</p>
      <p style="margin:0;line-height:1.5;font-size:14px;color:#555;">If you don't know this student, you can ignore this email: nothing changes until you answer.</p>
    `,
  }),
});
