-- CreateEnum
CREATE TYPE "VideoFormat" AS ENUM ('LANDSCAPE', 'SHORT');

-- AlterTable
ALTER TABLE "Video" ADD COLUMN     "format" "VideoFormat" NOT NULL DEFAULT 'LANDSCAPE';
