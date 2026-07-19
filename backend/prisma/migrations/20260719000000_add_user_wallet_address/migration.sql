-- AlterTable: add wallet address to User (schema.prisma declared it but no migration added it)
ALTER TABLE "User" ADD COLUMN "walletAddress" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_walletAddress_key" ON "User"("walletAddress");

-- CreateIndex
CREATE INDEX "User_walletAddress_idx" ON "User"("walletAddress");
