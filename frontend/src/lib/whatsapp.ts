import type { PublicSettings } from "@/lib/server-api";

// WhatsApp support (27 Nov 2026): Admin → Settings → General → Contact. The
// number is stored as digits with the country code ("919876543210"); empty =
// WhatsApp is hidden everywhere.

type Contact = PublicSettings["contact"];

/** wa.me link that opens a chat with the support number and the admin's starter text. */
export const whatsappHref = (contact: Contact): string | null => {
  const digits = contact.whatsappNumber?.replace(/\D/g, "");
  if (!digits || digits.length < 10) return null;
  const text = contact.whatsappMessage?.trim();
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
};

/** "+91 98765 43210" for an Indian mobile, "+447700900123" otherwise. */
export const whatsappLabel = (contact: Contact): string | null => {
  const digits = contact.whatsappNumber?.replace(/\D/g, "");
  if (!digits) return null;
  const india = /^91(\d{5})(\d{5})$/.exec(digits);
  return india ? `+91 ${india[1]} ${india[2]}` : `+${digits}`;
};
