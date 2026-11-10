-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('PENDING', 'GRANTED', 'DECLINED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "ParentalConsent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "parentEmail" TEXT NOT NULL,
    "status" "ConsentStatus" NOT NULL DEFAULT 'PENDING',
    "tokenHash" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSentAt" TIMESTAMP(3) NOT NULL,
    "sendCount" INTEGER NOT NULL DEFAULT 1,
    "parentName" TEXT,
    "relationship" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decidedVia" TEXT,
    "decidedIp" TEXT,
    "decidedUserAgent" TEXT,
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParentalConsent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ParentalConsent_userId_key" ON "ParentalConsent"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ParentalConsent_tokenHash_key" ON "ParentalConsent"("tokenHash");

-- CreateIndex
CREATE INDEX "ParentalConsent_status_idx" ON "ParentalConsent"("status");

-- AddForeignKey
ALTER TABLE "ParentalConsent" ADD CONSTRAINT "ParentalConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

