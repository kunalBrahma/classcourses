import { z } from "zod";

export const updatePageSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  bodyHtml: z.string().max(200_000).optional(),
  isPublished: z.boolean().optional(),
});

export const createFaqSchema = z.object({
  // Plain text (tokens like {{site.name}} allowed)
  question: z.string().trim().min(3).max(500),
  answerHtml: z.string().max(20_000),
  isPublished: z.boolean().optional(),
});
export const updateFaqSchema = createFaqSchema.partial();

export const reorderFaqSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(500) });

// Home page "Latest news" links. Only http(s) links: they're rendered as <a href>.
export const httpUrl = z
  .string()
  .trim()
  .max(500)
  .url()
  .refine((v) => /^https?:\/\//i.test(v), "The link must start with http:// or https://");

export const createNewsSchema = z.object({
  source: z.string().trim().min(1).max(60),
  title: z.string().trim().min(1).max(160),
  url: httpUrl,
  // Card picture: uploaded to the public bucket (absolute URL) or null to remove.
  imageUrl: httpUrl.nullable().optional(),
  isActive: z.boolean().optional(),
});
export const updateNewsSchema = createNewsSchema.partial();

export const reorderNewsSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(200) });

// Home page banners. The link is a page on this site ("/notes") or a full http(s)
// URL. "//host" and "/\\host" are refused: browsers treat those as other websites.
export const siteOrHttpLink = z
  .string()
  .trim()
  .max(500)
  .refine((v) => {
    if (v.startsWith("/")) return /^\/(?![/\\])[^\s\\]*$/.test(v);
    if (!/^https?:\/\//i.test(v)) return false;
    return URL.canParse(v);
  }, "The link must be a page on this site (starting with /) or start with http:// or https://");

const imageSize = z.number().int().positive().max(20000);

const bannerFields = z.object({
  // Optional. Not .default(""): on a PATCH that would wipe the text when it isn't sent.
  altText: z.string().trim().max(160).optional(),
  imageUrl: httpUrl,
  imageSmallUrl: httpUrl,
  width: imageSize,
  height: imageSize,
  mobileImageUrl: httpUrl.nullable().optional(),
  mobileWidth: imageSize.nullable().optional(),
  mobileHeight: imageSize.nullable().optional(),
  link: siteOrHttpLink.nullable().optional(),
  isActive: z.boolean().optional(),
});
type BannerFields = Partial<z.infer<typeof bannerFields>>;

// A picture and its sizes only make sense together: a PATCH can't change one alone.
const MAIN_PICTURE = ["imageUrl", "imageSmallUrl", "width", "height"] as const;
const PHONE_PICTURE = ["mobileImageUrl", "mobileWidth", "mobileHeight"] as const;
const pictureFieldsTogether = (body: BannerFields) => {
  const main = MAIN_PICTURE.filter((f) => body[f] !== undefined).length;
  const phoneSet = PHONE_PICTURE.filter((f) => body[f] !== undefined && body[f] !== null).length;
  const phoneNull = PHONE_PICTURE.filter((f) => body[f] === null).length;
  const mainOk = main === 0 || main === MAIN_PICTURE.length;
  const phoneOk = (phoneSet === 0 && (phoneNull === 0 || phoneNull === PHONE_PICTURE.length)) || (phoneSet === PHONE_PICTURE.length);
  return mainOk && phoneOk;
};
const PICTURE_FIELDS_MESSAGE = "A picture must be sent together with its sizes";

export const createBannerSchema = bannerFields.refine(pictureFieldsTogether, PICTURE_FIELDS_MESSAGE);
export const updateBannerSchema = bannerFields.partial().refine(pictureFieldsTogether, PICTURE_FIELDS_MESSAGE);
export const reorderBannersSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(200) });

// Helpline (the contact form). Topics are fixed so the admin can sort messages;
// the frontend shows the same list (frontend/src/lib/contact.ts). The client's
// Helpline options are Refund, Bug or Error and Other Help (6 Nov 2026), plus
// one for DPDP data requests.
export const CONTACT_TOPICS = ["Refund", "Bug or Error", "Other Help", "My data (see, correct or delete)"] as const;
// The earlier topics: old messages keep them, and an open browser tab with the
// old form can still send them.
export const LEGACY_CONTACT_TOPICS = ["General question", "Account or sign-in", "Quizzes and coins", "Notes and payments", "Report a mistake", "Other"] as const;
export const ALL_CONTACT_TOPICS = [...CONTACT_TOPICS, ...LEGACY_CONTACT_TOPICS] as const;

export const contactMessageSchema = z.object({
  name: z.string().trim().min(1, "Please enter your name").max(80),
  email: z.string().trim().toLowerCase().email("Please enter a valid email address").max(160),
  phone: z
    .string()
    .trim()
    .max(20)
    .optional()
    .transform((v) => (v ? v.replace(/[\s()-]/g, "").replace(/^(\+?91|0)(?=\d{10}$)/, "") : null))
    .refine((v) => v === null || /^[6-9]\d{9}$/.test(v), "Enter a 10-digit mobile number, or leave it empty"),
  topic: z.enum(ALL_CONTACT_TOPICS),
  message: z.string().trim().min(10, "Please write a little more (at least 10 characters)").max(2000),
  // Spam trap: a hidden field people never fill in.
  website: z.string().max(200).optional(),
});

export const contactStatusSchema = z.object({ status: z.enum(["NEW", "READ", "REPLIED", "ARCHIVED"]) });
