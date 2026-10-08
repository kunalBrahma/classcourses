"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangleIcon, ChevronLeftIcon, ChevronRightIcon, CopyIcon, IndianRupeeIcon, Loader2Icon, RefreshCwIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/admin/page-header";
import { formCard, pressable } from "@/components/admin/styles";
import { ApiError, apiJson } from "@/lib/api";
import { formatDate, rupees } from "@/lib/people";
import { CONFIRMED_VIA, ORDER_STATUS, OrderRow } from "@/lib/sales";
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
    <button type="button" onClick={() => copy(value)} className="inline-flex max-w-full items-center gap-1.5 font-mono text-xs hover:text-primary" title="Copy">
      <span className="truncate">{value}</span>
      <CopyIcon className="size-3 shrink-0" />
    </button>
  );
}

function OrderSheet({ order, onClose, onChanged }: { order: OrderRow | null; onClose: () => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);

  const reconcile = async () => {
    if (!order) return;
    setBusy(true);
    try {
      const res = await apiJson<{ changed: boolean; status: string; payments?: string[] }>(`/api/admin/orders/${order.id}/reconcile`, { method: "POST" });
      if (res.changed) toast.success("Payment found — note unlocked for the student");
      else if (res.status === "PAID") toast.info("Already paid");
      else toast.info("No completed payment at Razorpay", { description: res.payments?.length ? `Payment attempts: ${res.payments.join(", ")}` : "The student hasn't paid this order." });
      onChanged();
      if (res.changed) onClose();
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
            <div className="grid gap-5 px-4 pb-6">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className={status.className}>{status.label}</Badge>
                <span className="font-heading text-2xl font-bold tabular-nums">{rupees(order.amountPaise)}</span>
              </div>

              {order.lastError && (
                <Alert className="border-warning/40 bg-warning/10">
                  <AlertTriangleIcon className="text-warning" />
                  <AlertTitle>Needs attention</AlertTitle>
                  <AlertDescription>{order.lastError}</AlertDescription>
                </Alert>
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
              </div>

              <div className="divide-y rounded-xl border px-4">
                <Row label="Price"><span className="tabular-nums">{rupees(order.listPricePaise)}</span></Row>
                {order.coinsUsed > 0 && (
                  <Row label={`Coin discount (${order.coinsUsed} coins)`}><span className="tabular-nums text-success">− {rupees(order.discountPaise)}</span></Row>
                )}
                <Row label="Paid via Razorpay"><span className="font-semibold tabular-nums">{rupees(order.amountPaise)}</span></Row>
              </div>

              <div className="divide-y rounded-xl border px-4">
                <Row label="Razorpay order"><IdValue value={order.razorpayOrderId} /></Row>
                <Row label="Razorpay payment"><IdValue value={order.razorpayPaymentId} /></Row>
              </div>

              {order.status !== "PAID" && order.razorpayOrderId && (
                <div className="grid gap-2">
                  <Button className={pressable} disabled={busy} onClick={reconcile}>
                    {busy ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />} Check with Razorpay
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    If the student paid but the note didn&apos;t unlock (e.g. they closed the tab and the webhook didn&apos;t arrive), this asks Razorpay and unlocks it.
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
                        {o.lastError && <AlertTriangleIcon className="size-4 text-warning" aria-label="Needs attention" />}
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
