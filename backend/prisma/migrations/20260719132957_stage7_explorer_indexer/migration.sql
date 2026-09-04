-- CreateTable
CREATE TABLE "IndexedEvent" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "eventIndex" INTEGER NOT NULL DEFAULT 0,
    "slot" BIGINT NOT NULL,
    "blockTime" BIGINT,
    "programId" TEXT NOT NULL,
    "mint" TEXT,
    "projectId" TEXT,
    "accounts" JSONB,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IndexedEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnershipTransfer" (
    "id" TEXT NOT NULL,
    "mint" TEXT NOT NULL,
    "fromWallet" TEXT NOT NULL,
    "toWallet" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "signature" TEXT NOT NULL,
    "slot" BIGINT NOT NULL,
    "blockTime" BIGINT,
    "seq" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwnershipTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExplorerTransaction" (
    "id" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "mint" TEXT,
    "kind" TEXT NOT NULL,
    "summary" TEXT,
    "signer" TEXT,
    "slot" BIGINT NOT NULL,
    "blockTime" BIGINT,
    "instructionCount" INTEGER NOT NULL DEFAULT 0,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExplorerTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditSnapshot" (
    "creditId" TEXT NOT NULL,
    "projectId" TEXT,
    "projectName" TEXT,
    "projectType" TEXT,
    "methodology" TEXT,
    "vintage" INTEGER,
    "totalMinted" INTEGER NOT NULL DEFAULT 0,
    "totalRetired" INTEGER NOT NULL DEFAULT 0,
    "circulatingSupply" INTEGER NOT NULL DEFAULT 0,
    "currentOwner" TEXT,
    "reportStatus" TEXT,
    "reportCid" TEXT,
    "evidenceCids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "transferCount" INTEGER NOT NULL DEFAULT 0,
    "fullyRetired" BOOLEAN NOT NULL DEFAULT false,
    "lastSignature" TEXT,
    "lastSlot" BIGINT,
    "lastEventAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditSnapshot_pkey" PRIMARY KEY ("creditId")
);

-- CreateTable
CREATE TABLE "ProjectSnapshot" (
    "projectId" TEXT NOT NULL,
    "ownerId" TEXT,
    "projectName" TEXT,
    "projectType" TEXT,
    "methodology" TEXT,
    "expectedAnnualTonnes" DOUBLE PRECISION,
    "status" TEXT,
    "creditIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "totalMinted" INTEGER NOT NULL DEFAULT 0,
    "totalRetired" INTEGER NOT NULL DEFAULT 0,
    "circulatingSupply" INTEGER NOT NULL DEFAULT 0,
    "evidenceCount" INTEGER NOT NULL DEFAULT 0,
    "verificationCount" INTEGER NOT NULL DEFAULT 0,
    "retirementCount" INTEGER NOT NULL DEFAULT 0,
    "lastSignature" TEXT,
    "lastSlot" BIGINT,
    "lastEventAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectSnapshot_pkey" PRIMARY KEY ("projectId")
);

-- CreateTable
CREATE TABLE "IndexedRetirement" (
    "id" TEXT NOT NULL,
    "retirementRecord" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "mint" TEXT NOT NULL,
    "batch" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT,
    "reportRef" TEXT,
    "signature" TEXT NOT NULL,
    "slot" BIGINT NOT NULL,
    "blockTime" BIGINT,
    "totalRetired" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IndexedRetirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndexerCursor" (
    "id" TEXT NOT NULL,
    "lastSlot" BIGINT NOT NULL DEFAULT 0,
    "lastSignature" TEXT,
    "eventsIndexed" BIGINT NOT NULL DEFAULT 0,
    "txsProcessed" BIGINT NOT NULL DEFAULT 0,
    "lastPolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastBackfillAt" TIMESTAMP(3),
    "isBackfilling" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndexerCursor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IndexedEvent_eventType_idx" ON "IndexedEvent"("eventType");

-- CreateIndex
CREATE INDEX "IndexedEvent_mint_idx" ON "IndexedEvent"("mint");

-- CreateIndex
CREATE INDEX "IndexedEvent_projectId_idx" ON "IndexedEvent"("projectId");

-- CreateIndex
CREATE INDEX "IndexedEvent_slot_idx" ON "IndexedEvent"("slot");

-- CreateIndex
CREATE INDEX "IndexedEvent_createdAt_idx" ON "IndexedEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IndexedEvent_signature_eventIndex_key" ON "IndexedEvent"("signature", "eventIndex");

-- CreateIndex
CREATE INDEX "OwnershipTransfer_mint_idx" ON "OwnershipTransfer"("mint");

-- CreateIndex
CREATE INDEX "OwnershipTransfer_toWallet_idx" ON "OwnershipTransfer"("toWallet");

-- CreateIndex
CREATE INDEX "OwnershipTransfer_fromWallet_idx" ON "OwnershipTransfer"("fromWallet");

-- CreateIndex
CREATE INDEX "OwnershipTransfer_slot_idx" ON "OwnershipTransfer"("slot");

-- CreateIndex
CREATE INDEX "OwnershipTransfer_createdAt_idx" ON "OwnershipTransfer"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExplorerTransaction_signature_key" ON "ExplorerTransaction"("signature");

-- CreateIndex
CREATE INDEX "ExplorerTransaction_mint_idx" ON "ExplorerTransaction"("mint");

-- CreateIndex
CREATE INDEX "ExplorerTransaction_kind_idx" ON "ExplorerTransaction"("kind");

-- CreateIndex
CREATE INDEX "ExplorerTransaction_signer_idx" ON "ExplorerTransaction"("signer");

-- CreateIndex
CREATE INDEX "ExplorerTransaction_slot_idx" ON "ExplorerTransaction"("slot");

-- CreateIndex
CREATE INDEX "ExplorerTransaction_createdAt_idx" ON "ExplorerTransaction"("createdAt");

-- CreateIndex
CREATE INDEX "CreditSnapshot_projectId_idx" ON "CreditSnapshot"("projectId");

-- CreateIndex
CREATE INDEX "CreditSnapshot_currentOwner_idx" ON "CreditSnapshot"("currentOwner");

-- CreateIndex
CREATE INDEX "CreditSnapshot_vintage_idx" ON "CreditSnapshot"("vintage");

-- CreateIndex
CREATE INDEX "CreditSnapshot_reportStatus_idx" ON "CreditSnapshot"("reportStatus");

-- CreateIndex
CREATE INDEX "CreditSnapshot_fullyRetired_idx" ON "CreditSnapshot"("fullyRetired");

-- CreateIndex
CREATE INDEX "CreditSnapshot_updatedAt_idx" ON "CreditSnapshot"("updatedAt");

-- CreateIndex
CREATE INDEX "ProjectSnapshot_ownerId_idx" ON "ProjectSnapshot"("ownerId");

-- CreateIndex
CREATE INDEX "ProjectSnapshot_status_idx" ON "ProjectSnapshot"("status");

-- CreateIndex
CREATE INDEX "ProjectSnapshot_updatedAt_idx" ON "ProjectSnapshot"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "IndexedRetirement_retirementRecord_key" ON "IndexedRetirement"("retirementRecord");

-- CreateIndex
CREATE INDEX "IndexedRetirement_owner_idx" ON "IndexedRetirement"("owner");

-- CreateIndex
CREATE INDEX "IndexedRetirement_mint_idx" ON "IndexedRetirement"("mint");

-- CreateIndex
CREATE INDEX "IndexedRetirement_batch_idx" ON "IndexedRetirement"("batch");

-- CreateIndex
CREATE INDEX "IndexedRetirement_slot_idx" ON "IndexedRetirement"("slot");

-- CreateIndex
CREATE INDEX "IndexedRetirement_createdAt_idx" ON "IndexedRetirement"("createdAt");
