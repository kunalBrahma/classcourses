-- AlterEnum
ALTER TYPE "CoinReason" ADD VALUE 'COIN_EXPIRED';

-- CreateTable
CREATE TABLE "CoinLot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "creditTxId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "remaining" INTEGER NOT NULL,
    "creditedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "expiredAmount" INTEGER NOT NULL DEFAULT 0,
    "expiryCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CoinLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoinLotMove" (
    "id" TEXT NOT NULL,
    "txId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "CoinLotMove_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CoinLot_creditTxId_key" ON "CoinLot"("creditTxId");

-- CreateIndex
CREATE INDEX "CoinLot_userId_expiresAt_idx" ON "CoinLot"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "CoinLot_expiresAt_remaining_idx" ON "CoinLot"("expiresAt", "remaining");

-- CreateIndex
CREATE INDEX "CoinLotMove_txId_idx" ON "CoinLotMove"("txId");

-- CreateIndex
CREATE INDEX "CoinLotMove_lotId_idx" ON "CoinLotMove"("lotId");

-- AddForeignKey
ALTER TABLE "CoinLot" ADD CONSTRAINT "CoinLot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoinLot" ADD CONSTRAINT "CoinLot_creditTxId_fkey" FOREIGN KEY ("creditTxId") REFERENCES "CoinTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoinLotMove" ADD CONSTRAINT "CoinLotMove_txId_fkey" FOREIGN KEY ("txId") REFERENCES "CoinTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoinLotMove" ADD CONSTRAINT "CoinLotMove_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "CoinLot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
