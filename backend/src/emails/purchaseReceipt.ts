import { emailButton, emailLayout, escapeHtml } from "./layout";

const rupees = (paise: number) => `₹${(paise / 100).toFixed(2)}`;

export const purchaseReceiptEmail = (opts: {
  siteName: string;
  studentName: string | null;
  noteTitle: string;
  orderId: string;
  listPricePaise: number;
  coinsUsed: number;
  discountPaise: number;
  amountPaise: number;
  paidAt: Date;
  notesUrl: string;
}) => {
  const lines = [
    ["Note", opts.noteTitle],
    ["Price", rupees(opts.listPricePaise)],
    ...(opts.coinsUsed > 0 ? [[`Coin discount (${opts.coinsUsed} coins)`, `− ${rupees(opts.discountPaise)}`]] : []),
    ["Paid", rupees(opts.amountPaise)],
    ["Order", opts.orderId],
    ["Date", opts.paidAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })],
  ];
  return {
    subject: `Your ${opts.siteName} receipt — ${opts.noteTitle}`,
    text: [
      `Hi${opts.studentName ? ` ${opts.studentName}` : ""},`,
      "Thank you for your purchase. Your note is ready to download.",
      "",
      ...lines.map(([k, v]) => `${k}: ${v}`),
      "",
      `Download: ${opts.notesUrl}`,
    ].join("\n"),
    html: emailLayout({
      siteName: opts.siteName,
      heading: "Thank you for your purchase",
      bodyHtml: `
        <p style="margin:0 0 16px;line-height:1.5;">Hi${opts.studentName ? ` ${escapeHtml(opts.studentName)}` : ""}, your note is ready to download.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;border-collapse:collapse;">
          ${lines
            .map(
              ([k, v]) =>
                `<tr><td style="padding:6px 0;color:#555;border-bottom:1px solid #eee;">${escapeHtml(k)}</td><td style="padding:6px 0;text-align:right;border-bottom:1px solid #eee;">${escapeHtml(v)}</td></tr>`
            )
            .join("")}
        </table>
        ${emailButton(opts.notesUrl, "Go to my notes")}
      `,
    }),
  };
};
