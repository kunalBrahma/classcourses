import sanitize from "sanitize-html";

// Every rich-text field (chapter about, question, answer, option, explanation)
// passes through here before it is stored. The student site renders these
// strings as HTML, so this allowlist is the XSS boundary: no scripts, no event
// handlers, no inline styles, no SVG, links forced to open safely.
const OPTIONS: sanitize.IOptions = {
  allowedTags: [
    "p", "br", "hr", "strong", "b", "em", "i", "u", "s", "sub", "sup", "mark", "small", "span",
    "h2", "h3", "h4", "blockquote", "pre", "code",
    "ul", "ol", "li",
    "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption",
    "a", "img",
  ],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "title", "width", "height"],
    th: ["colspan", "rowspan"],
    td: ["colspan", "rowspan"],
    ol: ["start", "type"],
  },
  allowedSchemes: ["https", "http", "mailto"],
  allowedSchemesByTag: { img: ["https", "http"] },
  allowProtocolRelative: false,
  transformTags: {
    a: sanitize.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer nofollow" }),
    // Content is shown on another origin, so only absolute http(s) images make sense.
    img: (tagName, attribs) => {
      const { src, ...rest } = attribs;
      return { tagName, attribs: src && /^https?:\/\//i.test(src) ? { src, ...rest } : rest };
    },
  },
  // ...and an image left without a usable src is dropped entirely.
  exclusiveFilter: (frame) => frame.tag === "img" && !frame.attribs.src,
  disallowedTagsMode: "discard",
};

export const sanitizeRichText = (html: string): string => sanitize(html, OPTIONS).trim();

// For optional fields: blank (after sanitising) becomes null.
export const sanitizeOptional = (html: string | null | undefined): string | null => {
  if (html === null || html === undefined) return null;
  const clean = sanitizeRichText(html);
  return clean === "" ? null : clean;
};

// True when the HTML has visible content (text or an image), e.g. "<p></p>" → false.
export const hasVisibleContent = (html: string): boolean =>
  /<img\b/i.test(html) || sanitize(html, { allowedTags: [], allowedAttributes: {} }).trim().length > 0;
