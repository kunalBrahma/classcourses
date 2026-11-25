-- AlterEnum
ALTER TYPE "AuthCodePurpose" ADD VALUE 'CHANGE_EMAIL';

-- AlterTable
ALTER TABLE "AuthCode" ADD COLUMN     "newEmail" TEXT;
