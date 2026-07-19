-- CreateEnum
CREATE TYPE "RetirementStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CERTIFIED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditLogAction" ADD VALUE 'CREDIT_RETIRED';
ALTER TYPE "AuditLogAction" ADD VALUE 'RETIREMENT_CERTIFIED';

-- DropForeignKey
ALTER TABLE "Listing" DROP CONSTRAINT "Listing_sellerUserId_fkey";

-- CreateTable
CREATE TABLE "Holding" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "tokenMint" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "projectType" "ProjectType" NOT NULL,
    "methodology" TEXT NOT NULL,
    "vintage" INTEGER NOT NULL,
    "availableBalance" INTEGER NOT NULL,
    "totalRetired" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Holding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Retirement" (
    "id" TEXT NOT NULL,
    "retirementId" TEXT NOT NULL,
    "holdingId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "tokenMint" TEXT NOT NULL,
    "retiredAmount" INTEGER NOT NULL,
    "retiredBy" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "reasonCategory" TEXT NOT NULL,
    "transactionSignature" TEXT NOT NULL,
    "certificateCid" TEXT,
    "certificateUrl" TEXT,
    "status" "RetirementStatus" NOT NULL DEFAULT 'PENDING',
    "organization" TEXT,
    "projectName" TEXT,
    "methodology" TEXT,
    "vintage" INTEGER,
    "metadata" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Retirement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Holding_ownerId_idx" ON "Holding"("ownerId");

-- CreateIndex
CREATE INDEX "Holding_walletAddress_idx" ON "Holding"("walletAddress");

-- CreateIndex
CREATE INDEX "Holding_projectId_idx" ON "Holding"("projectId");

-- CreateIndex
CREATE INDEX "Holding_tokenMint_idx" ON "Holding"("tokenMint");

-- CreateIndex
CREATE UNIQUE INDEX "Holding_ownerId_tokenMint_key" ON "Holding"("ownerId", "tokenMint");

-- CreateIndex
CREATE UNIQUE INDEX "Retirement_retirementId_key" ON "Retirement"("retirementId");

-- CreateIndex
CREATE INDEX "Retirement_retiredBy_idx" ON "Retirement"("retiredBy");

-- CreateIndex
CREATE INDEX "Retirement_walletAddress_idx" ON "Retirement"("walletAddress");

-- CreateIndex
CREATE INDEX "Retirement_projectId_idx" ON "Retirement"("projectId");

-- CreateIndex
CREATE INDEX "Retirement_tokenMint_idx" ON "Retirement"("tokenMint");

-- CreateIndex
CREATE INDEX "Retirement_holdingId_idx" ON "Retirement"("holdingId");

-- CreateIndex
CREATE INDEX "Retirement_status_idx" ON "Retirement"("status");

-- CreateIndex
CREATE INDEX "Retirement_createdAt_idx" ON "Retirement"("createdAt");

-- AddForeignKey
ALTER TABLE "Holding" ADD CONSTRAINT "Holding_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Holding" ADD CONSTRAINT "Holding_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Retirement" ADD CONSTRAINT "Retirement_retiredBy_fkey" FOREIGN KEY ("retiredBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Retirement" ADD CONSTRAINT "Retirement_holdingId_fkey" FOREIGN KEY ("holdingId") REFERENCES "Holding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Retirement" ADD CONSTRAINT "Retirement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
