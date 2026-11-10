// Shapes from /api/admin/notes and /api/admin/orders.

export type OrderStatus = "CREATED" | "PAID" | "CANCELLED" | "REFUNDED";

export interface NoteRow {
  id: string;
  title: string;
  description: string | null;
  chapterId: string | null;
  subjectId: string | null;
  pricePaise: number;
  isFree: boolean;
  fileKey: string | null;
  fileSize: number | null;
  isPublished: boolean;
  createdAt: string;
  chapter: { id: string; title: string; subject: { id: string; name: string } } | null;
  subject: { id: string; name: string } | null;
  hasFile: boolean;
  buyers: number;
  paidOrders: number;
}

export interface OrderRow {
  id: string;
  status: OrderStatus;
  listPricePaise: number;
  coinsUsed: number;
  discountPaise: number;
  amountPaise: number;
  currency: string;
  // "cashfree" | "razorpay": the gateway this order used
  provider: "cashfree" | "razorpay";
  cashfreePaymentId: string | null;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  refundId: string | null;
  refundedAt: string | null;
  paidAt: string | null;
  confirmedVia: string | null;
  lastError: string | null;
  createdAt: string;
  user: { id: string; email: string; name: string | null };
  note: { id: string; title: string };
  // The list has the latest refund; the order detail has all of them
  refunds: RefundRow[];
}

export type RefundStatus = "PENDING" | "SUCCESS" | "FAILED";
export interface RefundRow {
  id?: string;
  status: RefundStatus;
  amountPaise: number;
  reason: "DUPLICATE" | "ADMIN" | "GATEWAY";
  note?: string | null;
  providerRefundId?: string | null;
  failureReason?: string | null;
  processedAt?: string | null;
  createdAt: string;
}

export const REFUND_STATUS: Record<RefundStatus, { label: string; className: string }> = {
  PENDING: { label: "Refund pending", className: "border-warning/40 bg-warning/10 text-warning" },
  SUCCESS: { label: "Refunded", className: "border-primary/30 bg-primary/10 text-brand-amber-text" },
  FAILED: { label: "Refund failed", className: "border-destructive/30 bg-destructive/10 text-destructive" },
};

export const REFUND_REASON: Record<RefundRow["reason"], string> = {
  DUPLICATE: "Same note paid twice (automatic, coins returned)",
  ADMIN: "Started by an admin",
  GATEWAY: "Made in the gateway's dashboard",
};

export const GATEWAY: Record<OrderRow["provider"], string> = { cashfree: "Cashfree", razorpay: "Razorpay" };

export const ORDER_STATUS: Record<OrderStatus, { label: string; className: string }> = {
  PAID: { label: "Paid", className: "border-success/30 bg-success/10 text-success" },
  CREATED: { label: "Awaiting payment", className: "border-warning/40 bg-warning/10 text-warning" },
  CANCELLED: { label: "Cancelled", className: "text-muted-foreground" },
  REFUNDED: { label: "Refunded", className: "border-primary/30 bg-primary/10 text-brand-amber-text" },
};

export const CONFIRMED_VIA: Record<string, string> = {
  verify: "Checkout confirmation",
  webhook: "Payment gateway webhook",
  reconcile: "Checked with the gateway (admin or automatic)",
  coins: "Fully paid with coins",
};

export const formatBytes = (bytes: number | null) => {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};
