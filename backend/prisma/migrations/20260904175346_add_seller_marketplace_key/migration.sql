-- CreateEnum
CREATE TYPE "SellerKeyStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "SellerMarketplaceKey" (
    "id" TEXT NOT NULL,
    "sellerUserId" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "encryptedSecret" TEXT NOT NULL,
    "status" "SellerKeyStatus" NOT NULL DEFAULT 'ACTIVE',
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellerMarketplaceKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SellerMarketplaceKey_sellerUserId_idx" ON "SellerMarketplaceKey"("sellerUserId");

-- CreateIndex
CREATE INDEX "SellerMarketplaceKey_walletAddress_idx" ON "SellerMarketplaceKey"("walletAddress");

-- CreateIndex
CREATE INDEX "SellerMarketplaceKey_status_idx" ON "SellerMarketplaceKey"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SellerMarketplaceKey_sellerUserId_walletAddress_status_key" ON "SellerMarketplaceKey"("sellerUserId", "walletAddress", "status");

-- AddForeignKey
ALTER TABLE "SellerMarketplaceKey" ADD CONSTRAINT "SellerMarketplaceKey_sellerUserId_fkey" FOREIGN KEY ("sellerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
