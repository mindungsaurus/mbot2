-- CreateEnum
CREATE TYPE "UserCapabilityType" AS ENUM ('AI_EXECUTE', 'AI_BUDGET_MANAGE', 'HISTORY_VIEW', 'HISTORY_REVIEW', 'HISTORY_APPROVE', 'HISTORY_EDIT');

-- CreateEnum
CREATE TYPE "AnalysisJobType" AS ENUM ('SMOKE_TEST', 'CHUNK_ANALYSIS', 'FRAGMENT_MERGE', 'PERSON_EVENT_GENERATION', 'BIOGRAPHY_GENERATION');

-- CreateEnum
CREATE TYPE "AnalysisJobStatus" AS ENUM ('WAITING_AUTHORIZATION', 'QUEUED', 'RUNNING', 'PAUSED', 'SUCCEEDED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "AnalysisTaskType" AS ENUM ('SMOKE_TEST', 'CHUNK_ANALYSIS', 'FRAGMENT_MERGE', 'PERSON_EVENT_GENERATION', 'BIOGRAPHY_GENERATION');

-- CreateEnum
CREATE TYPE "AnalysisTaskStatus" AS ENUM ('WAITING_AUTHORIZATION', 'QUEUED', 'RUNNING', 'PAUSED', 'SUCCEEDED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "AnalysisRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "AnalysisPriority" AS ENUM ('HIGH', 'NORMAL', 'LOW');

-- CreateTable
CREATE TABLE "UserCapability" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "capability" "UserCapabilityType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserCapability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisJob" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "type" "AnalysisJobType" NOT NULL,
    "status" "AnalysisJobStatus" NOT NULL DEFAULT 'WAITING_AUTHORIZATION',
    "priority" "AnalysisPriority" NOT NULL DEFAULT 'NORMAL',
    "createdByUserId" TEXT NOT NULL,
    "authorizedByUserId" TEXT,
    "billingOwnerUserId" TEXT,
    "authorizedAt" TIMESTAMP(3),
    "maxBudget" DECIMAL(12,6),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalysisJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisTask" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "type" "AnalysisTaskType" NOT NULL,
    "status" "AnalysisTaskStatus" NOT NULL DEFAULT 'WAITING_AUTHORIZATION',
    "priority" "AnalysisPriority" NOT NULL DEFAULT 'NORMAL',
    "idempotencyKey" TEXT,
    "payloadJson" JSONB,
    "resultJson" JSONB,
    "authorizedByUserId" TEXT,
    "billingOwnerUserId" TEXT,
    "authorizedAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lastError" TEXT,
    "lockedAt" TIMESTAMP(3),
    "lockExpiresAt" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3),
    "workerId" TEXT,
    "runAfterAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalysisTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisRun" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "pipelineVersion" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "totalTokens" INTEGER,
    "estimatedCost" DECIMAL(12,6),
    "status" "AnalysisRunStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "rawResponseJson" JSONB,
    "requestMetadataJson" JSONB,

    CONSTRAINT "AnalysisRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserCapability_userId_capability_key" ON "UserCapability"("userId", "capability");

-- CreateIndex
CREATE INDEX "UserCapability_capability_idx" ON "UserCapability"("capability");

-- CreateIndex
CREATE INDEX "AnalysisJob_campaignId_createdAt_idx" ON "AnalysisJob"("campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "AnalysisJob_status_priority_createdAt_idx" ON "AnalysisJob"("status", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "AnalysisJob_createdByUserId_idx" ON "AnalysisJob"("createdByUserId");

-- CreateIndex
CREATE INDEX "AnalysisJob_authorizedByUserId_idx" ON "AnalysisJob"("authorizedByUserId");

-- CreateIndex
CREATE INDEX "AnalysisJob_billingOwnerUserId_idx" ON "AnalysisJob"("billingOwnerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisTask_campaignId_idempotencyKey_key" ON "AnalysisTask"("campaignId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "AnalysisTask_jobId_status_idx" ON "AnalysisTask"("jobId", "status");

-- CreateIndex
CREATE INDEX "AnalysisTask_campaignId_status_idx" ON "AnalysisTask"("campaignId", "status");

-- CreateIndex
CREATE INDEX "AnalysisTask_status_priority_runAfterAt_createdAt_idx" ON "AnalysisTask"("status", "priority", "runAfterAt", "createdAt");

-- CreateIndex
CREATE INDEX "AnalysisTask_lockExpiresAt_idx" ON "AnalysisTask"("lockExpiresAt");

-- CreateIndex
CREATE INDEX "AnalysisTask_authorizedByUserId_idx" ON "AnalysisTask"("authorizedByUserId");

-- CreateIndex
CREATE INDEX "AnalysisTask_billingOwnerUserId_idx" ON "AnalysisTask"("billingOwnerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisRun_taskId_attemptNumber_key" ON "AnalysisRun"("taskId", "attemptNumber");

-- CreateIndex
CREATE INDEX "AnalysisRun_taskId_startedAt_idx" ON "AnalysisRun"("taskId", "startedAt");

-- CreateIndex
CREATE INDEX "AnalysisRun_status_idx" ON "AnalysisRun"("status");

-- AddForeignKey
ALTER TABLE "UserCapability" ADD CONSTRAINT "UserCapability_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisJob" ADD CONSTRAINT "AnalysisJob_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisJob" ADD CONSTRAINT "AnalysisJob_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisJob" ADD CONSTRAINT "AnalysisJob_authorizedByUserId_fkey" FOREIGN KEY ("authorizedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisJob" ADD CONSTRAINT "AnalysisJob_billingOwnerUserId_fkey" FOREIGN KEY ("billingOwnerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisTask" ADD CONSTRAINT "AnalysisTask_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AnalysisJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisTask" ADD CONSTRAINT "AnalysisTask_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisTask" ADD CONSTRAINT "AnalysisTask_authorizedByUserId_fkey" FOREIGN KEY ("authorizedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisTask" ADD CONSTRAINT "AnalysisTask_billingOwnerUserId_fkey" FOREIGN KEY ("billingOwnerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisRun" ADD CONSTRAINT "AnalysisRun_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AnalysisTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
