import { emailLayout, escapeHtml } from "./layout";

export const contactMessageEmail = (opts: { siteName: string; name: string; email: string; phone: string | null; topic: string; message: string }) => ({
  subject: `[${opts.siteName}] ${opts.topic} — ${opts.name}`,
  text: [
    `New message from the ${opts.siteName} contact form.`,
    "",
    `From: ${opts.name} <${opts.email}>`,
    ...(opts.phone ? [`Mobile: +91 ${opts.phone}`] : []),
    `Topic: ${opts.topic}`,
    "",
    opts.message,
    "",
    "Reply to this email to answer them. It's also in Admin → Messages.",
  ].join("\n"),
  html: emailLayout({
    siteName: opts.siteName,
    heading: "New contact message",
    bodyHtml: `
      <p style="margin:0 0 4px;font-size:14px;color:#555;">From</p>
      <p style="margin:0 0 12px;font-weight:bold;">${escapeHtml(opts.name)} &lt;${escapeHtml(opts.email)}&gt;${opts.phone ? ` · +91 ${escapeHtml(opts.phone)}` : ""}</p>
      <p style="margin:0 0 4px;font-size:14px;color:#555;">Topic</p>
      <p style="margin:0 0 12px;font-weight:bold;">${escapeHtml(opts.topic)}</p>
      <div style="margin:0 0 16px;padding:12px 14px;background:#fff7e8;border-radius:8px;line-height:1.5;white-space:pre-wrap;">${escapeHtml(opts.message)}</div>
      <p style="margin:0;font-size:14px;color:#555;">Reply to this email to answer them. The message is also saved in Admin → Messages.</p>
    `,
  }),
});
