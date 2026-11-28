import { getSiteSettings } from "@/lib/server-api";
import { whatsappHref } from "@/lib/whatsapp";
import { WhatsAppIcon } from "@/components/site/whatsapp-icon";

// The round "Chat on WhatsApp" button in the bottom corner of every page
// (Admin → Settings → General → Contact: a number, and "Show the round
// WhatsApp button" on). Hidden during a quiz (globals.css: leaving the page
// would forfeit the question on screen). Below dialogs (z-40 < their z-50), so
// it never covers the buy window or the payment popup.
export async function WhatsAppButton() {
  const { contact } = await getSiteSettings();
  const href = whatsappHref(contact);
  if (!href || contact.whatsappFloating === false) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-whatsapp-button
      translate="no"
      aria-label="Chat with us on WhatsApp (opens WhatsApp)"
      title="Chat with us on WhatsApp"
      className="notranslate group fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-3 z-40 grid size-12 place-items-center sm:size-14 rounded-full bg-[#25d366] text-white shadow-[0_6px_16px_rgb(0_0_0/0.28),inset_0_-3px_0_rgb(0_0_0/0.12)] transition hover:scale-105 hover:bg-[#1fbe5a] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#25d366]/40 active:scale-95 motion-reduce:transition-none sm:bottom-6 sm:right-6"
    >
      <WhatsAppIcon className="size-7 sm:size-8" />
    </a>
  );
}
