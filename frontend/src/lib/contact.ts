import { z } from "zod";

// Same topics and rules as the backend (backend/src/validations/pages.validation.ts
// contactMessageSchema). The server checks everything again.
// The Helpline's options (client requirements of 6 Nov 2026), plus data requests.
export const CONTACT_TOPICS = ["Refund", "Bug or Error", "Other Help", "My data (see, correct or delete)"] as const;
export type ContactTopic = (typeof CONTACT_TOPICS)[number];

// Short keys for links such as /contact?topic=refund (three-dot menu, policies).
export const HELPLINE_TOPICS: { key: string; topic: ContactTopic; label: string; hint: string }[] = [
  { key: "refund", topic: "Refund", label: "Refund", hint: "A payment, a duplicate order or a note you didn't get" },
  { key: "bug", topic: "Bug or Error", label: "Bug or Error", hint: "Something broken, or a mistake in an answer" },
  { key: "help", topic: "Other Help", label: "Other Help", hint: "Any other question" },
  { key: "data", topic: "My data (see, correct or delete)", label: "My data", hint: "See, correct or delete your personal data" },
];
export const topicFromKey = (key: string | null | undefined): ContactTopic | undefined => HELPLINE_TOPICS.find((t) => t.key === key)?.topic;

// What the message box suggests for each topic.
export const TOPIC_PLACEHOLDER: Record<ContactTopic, string> = {
  Refund: "Your order ID (My profile → My orders), the note's name, the date and what went wrong. Never send card numbers, UPI PINs or passwords.",
  "Bug or Error": "What happened and where: the class, subject and chapter, or the page you were on.",
  "Other Help": "Tell us how we can help.",
  "My data (see, correct or delete)": "Which data you'd like to see, correct or delete. A parent or guardian can write for a student under 18.",
};

const normalisePhone = (v: string) => v.replace(/[\s()-]/g, "").replace(/^(\+?91|0)(?=\d{10}$)/, "");

export const contactSchema = z.object({
  name: z.string().trim().min(1, "Please enter your name").max(80, "That's a bit long — 80 characters at most"),
  email: z.string().trim().min(1, "Please enter your email").email("That doesn't look like an email address").max(160),
  phone: z
    .string()
    .trim()
    .max(20)
    .refine((v) => v === "" || /^[6-9]\d{9}$/.test(normalisePhone(v)), "Enter a 10-digit mobile number, or leave it empty"),
  topic: z.enum(CONTACT_TOPICS, { errorMap: () => ({ message: "Please choose what it's about" }) }),
  message: z.string().trim().min(10, "Please write a little more (at least 10 characters)").max(2000, "Please keep it under 2000 characters"),
  // Spam trap (hidden from people).
  website: z.string().max(200).optional(),
});

export type ContactValues = z.infer<typeof contactSchema>;
export const MESSAGE_MAX = 2000;
export const toPayload = (v: ContactValues) => ({ ...v, phone: v.phone ? normalisePhone(v.phone) : undefined });
