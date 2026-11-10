import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader2Icon } from "lucide-react";
import { Container } from "@/components/site/container";
import { PaymentReturn } from "@/components/checkout/payment-return";

export const metadata: Metadata = { title: "Payment", robots: { index: false } };

// Cashfree sends the student here after a payment that left our page (some
// banks redirect instead of using the pop-up): /checkout/return?order_id=…
// The page asks our server, which asks Cashfree; the URL itself proves nothing.
export default function CheckoutReturnPage() {
  return (
    <Container className="py-10 sm:py-16">
      <Suspense fallback={<Loader2Icon className="mx-auto size-8 animate-spin text-brand-amber-text" aria-label="Loading" />}>
        <PaymentReturn />
      </Suspense>
    </Container>
  );
}
