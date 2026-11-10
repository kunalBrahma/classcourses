// Minimal, inline-styled HTML shell shared by all transactional emails
// (email clients ignore <style> blocks and external CSS).
const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const emailLayout = (opts: { siteName: string; heading: string; bodyHtml: string }) => `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#fff8ec;font-family:Arial,'Noto Sans Bengali',sans-serif;color:#3a2a00;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;">
          <tr><td style="background:#2e2000;color:#ffbe4d;padding:18px 24px;font-size:18px;font-weight:bold;">${escapeHtml(opts.siteName)}</td></tr>
          <tr><td style="padding:24px;">
            <h1 style="margin:0 0 16px;font-size:20px;">${escapeHtml(opts.heading)}</h1>
            ${opts.bodyHtml}
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

export const emailButton = (href: string, label: string) =>
  `<p style="margin:24px 0;"><a href="${escapeHtml(href)}" style="background:#f5a623;color:#3a2a00;text-decoration:none;padding:12px 20px;border-radius:12px;display:inline-block;font-weight:bold;">${escapeHtml(label)}</a></p>`;

export { escapeHtml };
