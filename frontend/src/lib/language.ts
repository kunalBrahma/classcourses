// The site's language (header 🌐), done with the Google Translate website widget:
// it translates the page in the visitor's browser, so there is no API, key or bill.
// The text in the code stays English. Mark what must not be translated with
// <NoTranslate> or the same two attributes (study content, quiz, checkout, legal text).
//
// The choice is Google's own `googtrans` cookie. English means no cookie, no script.
export const LANGUAGES = [
  { code: "en", name: "English", english: null },
  { code: "as", name: "অসমীয়া", english: "Assamese" },
] as const;

const COOKIE = "googtrans";
const SCRIPT_ID = "google-translate-script";
const HOLDER_ID = "google_translate_element";

export const readLanguage = (): string => {
  if (typeof document === "undefined") return "en";
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE}=/en/([^;]+)`));
  return match ? decodeURIComponent(match[1]) : "en";
};

// Google may also save the cookie on the parent domain, and the widget would read that copy.
const clearCookie = () => {
  const parts = window.location.hostname.split(".");
  const domains = [""];
  for (let i = 0; i < parts.length - 1; i++) domains.push(`; domain=.${parts.slice(i).join(".")}`);
  for (const domain of domains) document.cookie = `${COOKIE}=; path=/; max-age=0${domain}`;
};

// A full reload: the widget can't reliably undo a translation in an open page.
// That's why the globe is hidden during a quiz: leaving a question forfeits it.
export const changeLanguage = (code: string) => {
  clearCookie();
  if (code !== "en") document.cookie = `${COOKIE}=/en/${code}; path=/; max-age=31536000; samesite=lax`;
  window.location.reload();
};

// Google wraps text in <font> tags that React doesn't know about, and React then
// throws when it removes or inserts next to that text, which would crash the page.
// These do the same job on the node's real parent. Only installed while translating.
const guardReactFromTranslation = () => {
  const { removeChild, insertBefore } = Node.prototype;
  Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
    const parent = child.parentNode;
    if (parent !== this) return parent ? (removeChild.call(parent, child) as T) : child;
    return removeChild.call(this, child) as T;
  };
  Node.prototype.insertBefore = function <T extends Node>(this: Node, node: T, before: Node | null): T {
    const parent = before?.parentNode;
    if (before && parent !== this) return parent ? (insertBefore.call(parent, node, before) as T) : (insertBefore.call(this, node, null) as T);
    return insertBefore.call(this, node, before) as T;
  };
};

// An address has to stay exact: Google read the "about" in about.x@gmail.com as a word.
// Done for every email link, including those inside stored page text and FAQ answers.
const protectEmailLinks = () => {
  const mark = () => {
    document.querySelectorAll('a[href^="mailto:"]:not(.notranslate)').forEach((link) => {
      link.classList.add("notranslate");
      link.setAttribute("translate", "no");
    });
  };
  mark();
  new MutationObserver(mark).observe(document.body, { childList: true, subtree: true });
};

type TranslateWindow = Window & {
  googleTranslateElementInit?: () => void;
  google?: { translate?: { TranslateElement: new (options: object, holderId: string) => unknown } };
};

// If the script is blocked or offline, the page simply stays in English.
export const startTranslation = () => {
  if (document.getElementById(SCRIPT_ID)) return;
  guardReactFromTranslation();
  protectEmailLinks();

  const holder = document.createElement("div");
  holder.id = HOLDER_ID;
  holder.hidden = true;
  document.body.appendChild(holder);

  const win = window as TranslateWindow;
  win.googleTranslateElementInit = () => {
    const TranslateElement = win.google?.translate?.TranslateElement;
    if (TranslateElement) {
      new TranslateElement({ pageLanguage: "en", includedLanguages: LANGUAGES.map((l) => l.code).join(","), autoDisplay: false }, HOLDER_ID);
    }
  };

  const script = document.createElement("script");
  script.id = SCRIPT_ID;
  script.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
  script.async = true;
  document.body.appendChild(script);
};
