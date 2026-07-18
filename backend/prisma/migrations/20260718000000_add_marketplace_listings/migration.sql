-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('ACTIVE', 'SOLD', 'CANCELLED');

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "creditId" TEXT NOT NULL,
    "seller" TEXT NOT NULL,
    "buyer" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 1,
    "status" "ListingStatus" NOT NULL DEFAULT 'ACTIVE',
    "sellerUserId" TEXT,
    "projectId" TEXT,
    "projectName" TEXT,
    "projectType" "ProjectType",
    "methodology" TEXT,
    "vintage" INTEGER,
    "verifiedTonnes" DOUBLE PRECISION,
    "reportCid" TEXT,
    "metadata" JSONB,
    "txSignature" TEXT,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Listing_status_idx" ON "Listing"("status");

-- CreateIndex
CREATE INDEX "Listing_seller_idx" ON "Listing"("seller");

-- CreateIndex
CREATE INDEX "Listing_creditId_idx" ON "Listing"("creditId");

-- CreateIndex
CREATE INDEX "Listing_sellerUserId_idx" ON "Listing"("sellerUserId");

-- CreateIndex
CREATE INDEX "Listing_createdAt_idx" ON "Listing"("createdAt");

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_sellerUserId_fkey" FOREIGN KEY ("sellerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
