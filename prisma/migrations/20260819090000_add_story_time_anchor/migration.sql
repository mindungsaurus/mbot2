-- CreateTable
CREATE TABLE "StoryTimeAnchor" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "logSourceId" TEXT NOT NULL,
    "sourceStartAt" TIMESTAMP(3) NOT NULL,
    "sourceEndAt" TIMESTAMP(3) NOT NULL,
    "storyDay" INTEGER,
    "storyTimeLabel" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoryTimeAnchor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoryTimeAnchor_campaignId_sourceStartAt_idx" ON "StoryTimeAnchor"("campaignId", "sourceStartAt");

-- CreateIndex
CREATE INDEX "StoryTimeAnchor_logSourceId_sourceStartAt_sourceEndAt_idx" ON "StoryTimeAnchor"("logSourceId", "sourceStartAt", "sourceEndAt");

-- CreateIndex
CREATE INDEX "StoryTimeAnchor_storyDay_idx" ON "StoryTimeAnchor"("storyDay");

-- AddForeignKey
ALTER TABLE "StoryTimeAnchor" ADD CONSTRAINT "StoryTimeAnchor_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryTimeAnchor" ADD CONSTRAINT "StoryTimeAnchor_logSourceId_fkey" FOREIGN KEY ("logSourceId") REFERENCES "DiscordLogSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
