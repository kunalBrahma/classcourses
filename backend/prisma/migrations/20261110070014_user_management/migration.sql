-- CreateEnum
CREATE TYPE "AdminLevel" AS ENUM ('SUPER', 'HELPER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'BLOCKED', 'DELETED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "adminLevel" "AdminLevel" NOT NULL DEFAULT 'SUPER',
ADD COLUMN     "adminPermissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "statusChangedAt" TIMESTAMP(3),
ADD COLUMN     "statusReason" TEXT,
ADD COLUMN     "suspendedUntil" TIMESTAMP(3),
ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "BlockedEmail" (
    "email" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "blockedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlockedEmail_pkey" PRIMARY KEY ("email")
);

-- CreateTable
CREATE TABLE "AdminActivity" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "summary" TEXT,
    "reason" TEXT,
    "details" JSONB,
    "statusCode" INTEGER NOT NULL,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminActivity_createdAt_idx" ON "AdminActivity"("createdAt");

-- CreateIndex
CREATE INDEX "AdminActivity_actorId_createdAt_idx" ON "AdminActivity"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminActivity_targetType_targetId_idx" ON "AdminActivity"("targetType", "targetId");

