// Shapes from /api/admin/notes, /api/admin/orders and the razorpay setting.

export type OrderStatus = "CREATED" | "PAID" | "CANCELLED";

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
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  paidAt: string | null;
  confirmedVia: string | null;
  lastError: string | null;
  createdAt: string;
  user: { id: string; email: string; name: string | null };
  note: { id: string; title: string };
}

export const ORDER_STATUS: Record<OrderStatus, { label: string; className: string }> = {
  PAID: { label: "Paid", className: "border-success/30 bg-success/10 text-success" },
  CREATED: { label: "Awaiting payment", className: "border-warning/40 bg-warning/10 text-warning" },
  CANCELLED: { label: "Cancelled", className: "text-muted-foreground" },
};

export const CONFIRMED_VIA: Record<string, string> = {
  verify: "Checkout confirmation",
  webhook: "Razorpay webhook",
  reconcile: "Checked with Razorpay by an admin",
  coins: "Fully paid with coins",
};

export const formatBytes = (bytes: number | null) => {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};
