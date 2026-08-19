ALTER TABLE "DiscordLogSource"
ADD COLUMN "incrementalCursorMessageId" TEXT,
ADD COLUMN "incrementalScannedThroughAt" TIMESTAMP(3);

CREATE INDEX "DiscordLogSource_incrementalCursorMessageId_idx"
ON "DiscordLogSource"("incrementalCursorMessageId");
