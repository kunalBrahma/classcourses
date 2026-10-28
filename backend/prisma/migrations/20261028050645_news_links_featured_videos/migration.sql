-- AlterTable
ALTER TABLE "Video" ADD COLUMN     "featuredAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "NewsLink" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NewsLink_order_idx" ON "NewsLink"("order");
