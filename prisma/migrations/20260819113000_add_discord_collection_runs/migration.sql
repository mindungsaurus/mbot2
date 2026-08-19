-- CreateEnum
CREATE TYPE "DiscordCollectionMode" AS ENUM ('RANGE', 'INCREMENTAL');

-- CreateEnum
CREATE TYPE "DiscordCollectionStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED');

-- AlterTable
ALTER TABLE "DiscordMessage"
ADD COLUMN     "messageType" INTEGER,
ADD COLUMN     "embedsJson" JSONB;

-- CreateTable
CREATE TABLE "DiscordCollectionRun" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "logSourceId" TEXT NOT NULL,
    "mode" "DiscordCollectionMode" NOT NULL,
    "status" "DiscordCollectionStatus" NOT NULL,
    "requestedStartAt" TIMESTAMP(3),
    "requestedEndAt" TIMESTAMP(3),
    "resolvedStartAt" TIMESTAMP(3) NOT NULL,
    "resolvedEndAt" TIMESTAMP(3) NOT NULL,
    "fetchedCount" INTEGER NOT NULL DEFAULT 0,
    "newCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "unchangedCount" INTEGER NOT NULL DEFAULT 0,
    "attachmentCount" INTEGER NOT NULL DEFAULT 0,
    "firstMessageAt" TIMESTAMP(3),
    "lastMessageAt" TIMESTAMP(3),
    "lastCursorMessageId" TEXT,
    "errorMessage" TEXT,
    "requestedByUserId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscordCollectionRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiscordCollectionRun_campaignId_startedAt_idx" ON "DiscordCollectionRun"("campaignId", "startedAt");

-- CreateIndex
CREATE INDEX "DiscordCollectionRun_logSourceId_startedAt_idx" ON "DiscordCollectionRun"("logSourceId", "startedAt");

-- CreateIndex
CREATE INDEX "DiscordCollectionRun_status_idx" ON "DiscordCollectionRun"("status");

-- CreateIndex
CREATE INDEX "DiscordCollectionRun_requestedByUserId_idx" ON "DiscordCollectionRun"("requestedByUserId");

-- AddForeignKey
ALTER TABLE "DiscordCollectionRun" ADD CONSTRAINT "DiscordCollectionRun_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscordCollectionRun" ADD CONSTRAINT "DiscordCollectionRun_logSourceId_fkey" FOREIGN KEY ("logSourceId") REFERENCES "DiscordLogSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscordCollectionRun" ADD CONSTRAINT "DiscordCollectionRun_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
