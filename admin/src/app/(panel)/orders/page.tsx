"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangleIcon, ChevronLeftIcon, ChevronRightIcon, CopyIcon, IndianRupeeIcon, Loader2Icon, RefreshCwIcon, Undo2Icon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/admin/page-header";
import { formCard, pressable } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";
import { formatDate, rupees } from "@/lib/people";
import { CONFIRMED_VIA, GATEWAY, ORDER_STATUS, OrderRow, REFUND_REASON, REFUND_STATUS, RefundRow } from "@/lib/sales";
import { cn } from "@/lib/utils";

interface OrdersPage {
  orders: OrderRow[];
  total: number;
  page: number;
  totalPages: number;
  paid: { count: number; amountPaise: number };
}

const copy = (text: string) => navigator.clipboard.writeText(text).then(() => toast.success("Copied"));

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  );
}

function IdValue({ value }: { value: string | null }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return (
    <button type="button" onClick={() => copy(value)} className="inline-flex max-w-full items-center gap-1.5 font-mono text-xs hover:text-brand-amber-text" title="Copy">
      <span className="truncate">{value}</span>
      <CopyIcon className="size-3 shrink-0" />
    </button>
  );
}

// Full refund through the order's gateway, with a written reason (kept with
// the refund). Completes only when the gateway confirms it.
function RefundDialog({ order, open, onOpenChange, onDone }: { order: OrderRow; open: boolean; onOpenChange: (open: boolean) => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiJson<{ message: string; refund: RefundRow }>(`/api/admin/orders/${order.id}/refund`, { method: "POST", json: { reason: reason.trim() } });
      toast.success(res.refund.status === "SUCCESS" ? "Refunded" : "Refund started", { description: res.message });
      setReason("");
      onOpenChange(false);
      onDone();
    } catch (err) {
      setError((err as ApiError).message);
      onDone(); // a FAILED refund is now in the history
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">Refund {rupees(order.amountPaise)}?</DialogTitle>
          <DialogDescription>
            The money goes back to the student through {GATEWAY[order.provider]}, to the way they paid. The order changes to Refunded and the student loses
            this note only when {GATEWAY[order.provider]} confirms the refund.
            {order.coinsUsed > 0 && ` The ${order.coinsUsed} coins used on it are not returned (only a duplicate purchase gets its coins back).`}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="refund-reason" className="text-sm font-semibold">
            Reason
          </Label>
          <Textarea
            id="refund-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            rows={3}
            placeholder="e.g. The PDF was the wrong chapter (Helpline message from 12 Nov)"
            className="text-base"
          />
          <p className="text-xs text-muted-foreground">Kept with the refund, so there&apos;s a record of why.</p>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" className="h-10" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" className="h-10" disabled={busy || reason.trim().length < 5} onClick={submit}>
            {busy && <Loader2Icon className="animate-spin" />} Refund {rupees(order.amountPaise)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RefundHistory({ refunds }: { refunds: RefundRow[] }) {
  if (!refunds.length) return null;
  return (
    <div className="grid gap-2">
      <p className="text-sm font-semibold">Refunds</p>
      <ul className="divide-y rounded-xl border">
        {refunds.map((r, i) => (
          <li key={r.id ?? i} className="grid gap-1 px-4 py-3 text-sm">
            <span className="flex flex-wrap items-center justify-between gap-2">
              <Badge variant="outline" className={REFUND_STATUS[r.status].className}>
                {REFUND_STATUS[r.status].label}
              </Badge>
              <span className="font-semibold tabular-nums">{rupees(r.amountPaise)}</span>
            </span>
            <span className="text-xs text-muted-foreground">
              {REFUND_REASON[r.reason]} · {formatDate(r.createdAt, true)}
              {r.processedAt && ` · confirmed ${formatDate(r.processedAt, true)}`}
            </span>
            {r.note && <span className="text-xs">{r.note}</span>}
            {r.failureReason && <span className="text-xs text-destructive">{r.failureReason}</span>}
            {r.providerRefundId && (
              <span className="text-xs text-muted-foreground">
                Gateway reference: <IdValue value={r.providerRefundId} />
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function OrderSheet({ order: row, onClose, onChanged }: { order: OrderRow | null; onClose: () => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [refunding, setRefunding] = useState(false);
  // The full order (all refunds), loaded when the panel opens.
  const [detail, setDetail] = useState<OrderRow | null>(null);
  const loadDetail = useCallback((id: string) => {
    apiJson<{ order: OrderRow }>(`/api/admin/orders/${id}`)
      .then(({ order }) => setDetail(order))
      .catch(() => setDetail(null));
  }, []);
  useEffect(() => {
    if (row) loadDetail(row.id);
  }, [row, loadDetail]);
  const order = detail && row && detail.id === row.id ? detail : row;
  const activeRefund = order?.refunds?.find((r) => r.status === "PENDING" || r.status === "SUCCESS");
  const pendingRefund = order?.refunds?.find((r) => r.status === "PENDING");

  const reconcile = async () => {
    if (!order) return;
    setBusy(true);
    try {
      const res = await apiJson<{ changed: boolean; status: string; payments?: string[]; refundStatus?: string | null }>(`/api/admin/orders/${order.id}/reconcile`, { method: "POST" });
      const gateway = GATEWAY[order.provider];
      if (res.refundStatus === "PENDING") toast.info(`${gateway} is still processing the refund`, { description: "It usually finishes within minutes. The page updates when it does." });
      else if (res.changed && res.status === "REFUNDED") toast.success(`Refund confirmed by ${gateway}`);
      else if (res.changed) toast.success("Payment found — note unlocked for the student");
      else if (res.status === "PAID") toast.info("Already paid");
      else toast.info(`No completed payment at ${gateway}`, { description: res.payments?.length ? `Payment attempts: ${res.payments.join(", ")}` : "The student hasn't paid this order." });
      onChanged();
      loadDetail(order.id);
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  const status = order ? ORDER_STATUS[order.status] : null;
  return (
    <Sheet open={order !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {order && status && (
          <>
            <SheetHeader>
              <SheetTitle className="font-heading">Order</SheetTitle>
              <SheetDescription className="font-mono text-xs">{order.id}</SheetDescription>
            </SheetHeader>
            {/* minmax(0,1fr): long references (a 36-character Cashfree order id) truncate instead of widening the panel */}
            <div className="grid grid-cols-[minmax(0,1fr)] gap-5 px-4 pb-6">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className={status.className}>{status.label}</Badge>
                <span className="font-heading text-2xl font-bold tabular-nums">{rupees(order.amountPaise)}</span>
              </div>

              {order.lastError && order.status !== "REFUNDED" && order.status !== "CANCELLED" && (
                <Alert className="border-warning/40 bg-warning/10">
                  <AlertTriangleIcon className="text-warning" />
                  <AlertTitle>Needs attention</AlertTitle>
                  <AlertDescription>{order.lastError}</AlertDescription>
                </Alert>
              )}
              {order.lastError && (order.status === "REFUNDED" || order.status === "CANCELLED") && (
                <p className="rounded-xl border bg-muted/40 px-4 py-3 text-sm">{order.lastError}</p>
              )}

              <div className="divide-y rounded-xl border px-4">
                <Row label="Student">
                  <Link href={`/users/${order.user.id}`} className="font-medium hover:underline">{order.user.name || order.user.email}</Link>
                  {order.user.name && <span className="block text-xs text-muted-foreground">{order.user.email}</span>}
                </Row>
                <Row label="Note"><span lang="as">{order.note.title}</span></Row>
                <Row label="Created">{formatDate(order.createdAt, true)}</Row>
                {order.paidAt && <Row label="Paid">{formatDate(order.paidAt, true)}</Row>}
                {order.confirmedVia && <Row label="Confirmed by">{CONFIRMED_VIA[order.confirmedVia] ?? order.confirmedVia}</Row>}
                {order.refundedAt && <Row label="Refunded">{formatDate(order.refundedAt, true)}</Row>}
              </div>

              <div className="divide-y rounded-xl border px-4">
                <Row label="Price"><span className="tabular-nums">{rupees(order.listPricePaise)}</span></Row>
                {order.coinsUsed > 0 && (
                  <Row label={`Coin discount (${order.coinsUsed} coins)`}><span className="tabular-nums text-success">− {rupees(order.discountPaise)}</span></Row>
                )}
                <Row label={`Paid via ${GATEWAY[order.provider]}`}><span className="font-semibold tabular-nums">{rupees(order.amountPaise)}</span></Row>
              </div>

              <div className="divide-y rounded-xl border px-4">
                {order.provider === "cashfree" ? (
                  <>
                    <Row label="Cashfree order"><IdValue value={order.id} /></Row>
                    <Row label="Cashfree payment"><IdValue value={order.cashfreePaymentId} /></Row>
                  </>
                ) : (
                  <>
                    <Row label="Razorpay order"><IdValue value={order.razorpayOrderId} /></Row>
                    <Row label="Razorpay payment"><IdValue value={order.razorpayPaymentId} /></Row>
                  </>
                )}
                {order.status === "REFUNDED" && <Row label={`${GATEWAY[order.provider]} refund`}><IdValue value={order.refundId} /></Row>}
              </div>

              <RefundHistory refunds={detail?.id === order.id ? order.refunds : []} />

              {/* Paid, nothing refunded or in progress: the admin can refund it. */}
              {order.status === "PAID" && !activeRefund && order.amountPaise > 0 && (
                <div className="grid gap-2">
                  <Button variant="outline" className="h-11 border-destructive/40 text-destructive hover:bg-destructive/10" onClick={() => setRefunding(true)}>
                    <Undo2Icon /> Refund {rupees(order.amountPaise)}
                  </Button>
                  <p className="text-xs text-muted-foreground">For a genuine problem under the Refund Policy (wrong or broken file, money taken but no note).</p>
                  <RefundDialog
                    order={order}
                    open={refunding}
                    onOpenChange={setRefunding}
                    onDone={() => {
                      onChanged();
                      loadDetail(order.id);
                    }}
                  />
                </div>
              )}

              {/* Unpaid: look for a payment. A refund waiting for the gateway, or a duplicate whose refund failed: check / retry. */}
              {((order.status !== "PAID" && order.status !== "REFUNDED") || pendingRefund || (order.status === "PAID" && /refund failed/i.test(order.lastError ?? "") && !activeRefund)) &&
                (order.razorpayOrderId || order.provider === "cashfree") && (
                <div className="grid gap-2">
                  <Button className={pressable} disabled={busy} onClick={reconcile}>
                    {busy ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />} {pendingRefund ? "Check the refund" : `Check with ${GATEWAY[order.provider]}`}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    {pendingRefund
                      ? `Asks ${GATEWAY[order.provider]} whether the refund went through (it's also checked automatically).`
                      : order.status === "PAID"
                        ? "The student paid twice for this note. This tries the automatic refund again."
                        : `If the student paid but the note didn't unlock (e.g. they closed the tab and the webhook didn't arrive), this asks ${GATEWAY[order.provider]} and unlocks it.`}
                  </p>
                </div>
              )}
              {order.status === "CANCELLED" && order.coinsUsed > 0 && (
                <p className="text-xs text-muted-foreground">The {order.coinsUsed} coins held for this order were returned to the student.</p>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function OrdersList() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const status = params.get("status") ?? "all";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [data, setData] = useState<OrdersPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<OrderRow | null>(null);

  const update = (next: Record<string, string | null>) => {
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) q.set(k, v);
      else q.delete(k);
    }
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  };

  const load = useCallback(() => {
    const q = new URLSearchParams({ page: String(page), pageSize: "25" });
    if (status !== "all") q.set("status", status);
    apiJson<OrdersPage>(`/api/admin/orders?${q.toString()}`)
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((err: ApiError) => setError(err.message));
  }, [status, page]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader title="Orders" description="Every premium-note purchase. Unpaid orders are cancelled after 30 minutes and any coins held for them are returned." />

      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <Card className={cn(formCard, "gap-1 px-4 py-3")}>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><IndianRupeeIcon className="size-3.5" /> Revenue</span>
          <span className="font-heading text-2xl font-bold tabular-nums">{data ? rupees(data.paid.amountPaise) : "—"}</span>
        </Card>
        <Card className={cn(formCard, "gap-1 px-4 py-3")}>
          <span className="text-xs text-muted-foreground">Paid orders</span>
          <span className="font-heading text-2xl font-bold tabular-nums">{data ? data.paid.count : "—"}</span>
        </Card>
      </div>

      <Tabs value={status} onValueChange={(v) => update({ status: v === "all" ? null : v, page: null })}>
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="all" className="h-9 px-3">All</TabsTrigger>
          <TabsTrigger value="PAID" className="h-9 px-3">Paid</TabsTrigger>
          <TabsTrigger value="CREATED" className="h-9 px-3">Awaiting payment</TabsTrigger>
          <TabsTrigger value="CANCELLED" className="h-9 px-3">Cancelled</TabsTrigger>
          <TabsTrigger value="REFUNDED" className="h-9 px-3">Refunded</TabsTrigger>
        </TabsList>
      </Tabs>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {!data && !error && <Skeleton className="h-80 rounded-2xl" />}

      {data && (
        <Card className={`${formCard} gap-0 py-0`}>
          <ul className="divide-y">
            {data.orders.map((o) => {
              const s = ORDER_STATUS[o.status];
              return (
                <li key={o.id}>
                  <button type="button" onClick={() => setOpen(o)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40">
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium">{o.user.name || o.user.email}</span>
                        <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px]", s.className)}>{s.label}</Badge>
                        {o.status === "PAID" && o.refunds?.[0] && o.refunds[0].status !== "SUCCESS" && (
                          <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px]", REFUND_STATUS[o.refunds[0].status].className)}>{REFUND_STATUS[o.refunds[0].status].label}</Badge>
                        )}
                        {o.lastError && (o.status === "PAID" || o.status === "CREATED") && <AlertTriangleIcon className="size-4 text-warning" aria-label="Needs attention" />}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground" lang="as">{o.note.title}</span>
                      <span className="block text-xs text-muted-foreground">{formatDate(o.createdAt, true)}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-semibold tabular-nums">{rupees(o.amountPaise)}</span>
                      {o.coinsUsed > 0 && <span className="block text-xs text-muted-foreground tabular-nums">+{o.coinsUsed} coins</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {data.orders.length === 0 && <p className="px-4 py-12 text-center text-sm text-muted-foreground">No orders {status === "all" ? "yet" : "in this view"}.</p>}
          <div className="flex items-center justify-between gap-2 border-t px-4 py-3 text-sm">
            <span className="text-muted-foreground tabular-nums">{data.total} order{data.total === 1 ? "" : "s"}</span>
            {data.totalPages > 1 && (
              <span className="flex items-center gap-2">
                <Button variant="outline" size="icon" className="size-9" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })} aria-label="Previous page"><ChevronLeftIcon /></Button>
                <span className="tabular-nums">{page} / {data.totalPages}</span>
                <Button variant="outline" size="icon" className="size-9" disabled={page >= data.totalPages} onClick={() => update({ page: String(page + 1) })} aria-label="Next page"><ChevronRightIcon /></Button>
              </span>
            )}
          </div>
        </Card>
      )}

      <OrderSheet order={open} onClose={() => setOpen(null)} onChanged={load} />
    </div>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
      <OrdersList />
    </Suspense>
  );
}
