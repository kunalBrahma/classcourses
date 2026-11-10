-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cashfreePaymentId" TEXT,
ADD COLUMN     "cashfreeSessionId" TEXT,
ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'razorpay';

-- CreateIndex
CREATE UNIQUE INDEX "Order_cashfreePaymentId_key" ON "Order"("cashfreePaymentId");

