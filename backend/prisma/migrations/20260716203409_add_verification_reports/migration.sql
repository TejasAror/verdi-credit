-- CreateTable
CREATE TABLE "VerificationReport" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "verifiedTonnes" DOUBLE PRECISION NOT NULL,
    "confidenceScore" DOUBLE PRECISION NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "reportCid" TEXT NOT NULL,
    "reportUrl" TEXT,
    "ndviScore" DOUBLE PRECISION,
    "anomalies" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VerificationReport_projectId_idx" ON "VerificationReport"("projectId");

-- CreateIndex
CREATE INDEX "VerificationReport_status_idx" ON "VerificationReport"("status");

-- CreateIndex
CREATE INDEX "VerificationReport_createdAt_idx" ON "VerificationReport"("createdAt");

-- AddForeignKey
ALTER TABLE "VerificationReport" ADD CONSTRAINT "VerificationReport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

