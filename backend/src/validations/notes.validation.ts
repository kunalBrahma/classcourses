import { z } from "zod";

export const MAX_NOTE_BYTES = 50 * 1024 * 1024;
const id = z.string().uuid();

const noteFields = {
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  // Attach to ONE of: a chapter, or a whole subject
  chapterId: id.nullable().optional(),
  subjectId: id.nullable().optional(),
  // Razorpay's minimum is ₹1 (100 paise); cap at ₹10,000
  pricePaise: z.number().int().min(0).max(1_000_000).optional(),
  isFree: z.boolean().optional(),
};

const attachRule = (v: { chapterId?: string | null; subjectId?: string | null }) => !(v.chapterId && v.subjectId);

export const createNoteSchema = z
  .object(noteFields)
  .refine((v) => Boolean(v.chapterId || v.subjectId), "Attach the note to a chapter or a subject")
  .refine(attachRule, "Attach the note to a chapter OR a subject, not both");

export const updateNoteSchema = z
  .object({ ...noteFields, title: noteFields.title.optional(), isPublished: z.boolean().optional() })
  .refine(attachRule, "Attach the note to a chapter OR a subject, not both");

export const noteUploadUrlSchema = z.object({
  contentType: z.literal("application/pdf"),
  size: z.number().int().min(1).max(MAX_NOTE_BYTES, "PDFs must be 50 MB or smaller"),
});

export const noteFileSchema = z.object({ key: z.string().min(1).max(300) });

export const grantNoteSchema = z.object({ userId: id });

export const createOrderSchema = z.object({ noteId: id, useCoins: z.boolean().default(false) });

// Field names exactly as Razorpay Checkout's success handler returns them.
export const verifyPaymentSchema = z.object({
  orderId: id,
  razorpay_order_id: z.string().min(1).max(100),
  razorpay_payment_id: z.string().min(1).max(100),
  razorpay_signature: z.string().min(1).max(200),
});
