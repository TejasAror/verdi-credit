-- CreateEnum
CREATE TYPE "Role" AS ENUM ('DEVELOPER', 'BUYER', 'AUDITOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('REFORESTATION', 'SOIL_CARBON', 'RENEWABLE_ENERGY');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'RETIRED');

-- CreateEnum
CREATE TYPE "EvidenceSource" AS ENUM ('SENTINEL2', 'LANDSAT', 'NASA_EARTHDATA', 'OPENWEATHER', 'GEO_UPLOAD');

-- CreateEnum
CREATE TYPE "EvidenceStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AuditLogAction" AS ENUM ('ROLE_CHANGED', 'ROLE_PROMOTED', 'ROLE_DEMOTED', 'EVIDENCE_UPLOADED', 'EVIDENCE_DELETED', 'EVIDENCE_VIEWED');

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "action" "AuditLogAction" NOT NULL,
    "previousRole" "Role",
    "newRole" "Role",
    "evidenceId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "supabaseId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT,
    "role" "Role" NOT NULL DEFAULT 'BUYER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "projectType" "ProjectType" NOT NULL,
    "methodology" TEXT NOT NULL,
    "expectedAnnualTonnes" DOUBLE PRECISION NOT NULL,
    "geoPolygon" JSONB NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "source" "EvidenceSource" NOT NULL,
    "status" "EvidenceStatus" NOT NULL DEFAULT 'PENDING',
    "cid" TEXT NOT NULL,
    "ipfsUrl" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "timestamp" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_targetId_idx" ON "AuditLog"("targetId");

-- CreateIndex
CREATE INDEX "AuditLog_evidenceId_idx" ON "AuditLog"("evidenceId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_supabaseId_key" ON "User"("supabaseId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "Project_ownerId_idx" ON "Project"("ownerId");

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX "Evidence_projectId_idx" ON "Evidence"("projectId");

-- CreateIndex
CREATE INDEX "Evidence_source_idx" ON "Evidence"("source");

-- CreateIndex
CREATE INDEX "Evidence_status_idx" ON "Evidence"("status");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

