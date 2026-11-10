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

// `parentConfirmed`: the unticked checkout box "a parent or guardian has
// permitted this purchase" (client requirements of 6 Nov 2026). The order is
// refused without it; the time is stored on the order.
export const createOrderSchema = z.object({
  noteId: id,
  useCoins: z.boolean().default(false),
  parentConfirmed: z.literal(true, {
    errorMap: () => ({ message: "Please tick the box to confirm a parent or guardian has permitted this purchase" }),
  }),
});

// Cashfree: just { orderId } (the server asks Cashfree). Razorpay: field
// names exactly as Razorpay Checkout's success handler returns them.
export const verifyPaymentSchema = z.object({
  orderId: id,
  razorpay_order_id: z.string().min(1).max(100).optional(),
  razorpay_payment_id: z.string().min(1).max(100).optional(),
  razorpay_signature: z.string().min(1).max(200).optional(),
});

// Admin → Orders → Refund: the reason is required and kept with the refund.
export const startRefundSchema = z.object({
  reason: z.string().trim().min(5, "Write the reason for the refund (at least a few words)").max(300),
});
