import { emailButton, emailLayout, escapeHtml } from "./layout";

// A notice or warning from the team to one student (Admin → Users → Send a
// notice). Also emailed because a suspended or blocked student can't open the
// site's inbox.
export const noticeEmail = (opts: { siteName: string; title: string; body: string; kind: "NOTICE" | "WARNING" | "ACCOUNT"; link: string | null; inboxUrl: string; helplineUrl: string }) => {
  const label = opts.kind === "WARNING" ? "Warning" : "Notice";
  const paragraphs = opts.body.split(/\n{2,}/).map((p) => `<p style="margin:0 0 12px;line-height:1.5;">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`);
  return {
    subject: `${label} from ${opts.siteName}: ${opts.title}`,
    text: [opts.title, "", opts.body, "", ...(opts.link ? [opts.link, ""] : []), `Questions? Write to our Helpline: ${opts.helplineUrl}`].join("\n"),
    html: emailLayout({
      siteName: opts.siteName,
      heading: opts.title,
      bodyHtml: `
        ${paragraphs.join("")}
        ${opts.link ? emailButton(opts.link, "Open") : emailButton(opts.inboxUrl, "See it on the site")}
        <p style="margin:16px 0 0;line-height:1.5;font-size:14px;color:#555;">Questions? Write to our <a href="${escapeHtml(opts.helplineUrl)}">Helpline</a>.</p>
      `,
    }),
  };
};
