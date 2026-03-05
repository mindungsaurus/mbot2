-- CreateTable
CREATE TABLE "public"."SkillEntry" (
    "id" SERIAL NOT NULL,
    "skillKey" TEXT NOT NULL,
    "sourceMessageId" TEXT NOT NULL,
    "sourceMessageUrl" TEXT NOT NULL,
    "sourceChannelId" TEXT NOT NULL,
    "sourceChannelName" TEXT NOT NULL,
    "sourceThreadId" TEXT,
    "sourceThreadName" TEXT,
    "jobName" TEXT NOT NULL,
    "skillName" TEXT NOT NULL,
    "conditionText" TEXT,
    "titleRaw" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "bodyRaw" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SkillEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SkillEntry_skillKey_key" ON "public"."SkillEntry"("skillKey");

-- CreateIndex
CREATE UNIQUE INDEX "SkillEntry_sourceMessageId_key" ON "public"."SkillEntry"("sourceMessageId");

-- CreateIndex
CREATE INDEX "SkillEntry_normalizedName_idx" ON "public"."SkillEntry"("normalizedName");

-- CreateIndex
CREATE INDEX "SkillEntry_jobName_idx" ON "public"."SkillEntry"("jobName");
