-- CreateTable
CREATE TABLE "public"."SpellEntry" (
    "id" SERIAL NOT NULL,
    "sourceMessageId" TEXT NOT NULL,
    "sourceMessageUrl" TEXT NOT NULL,
    "sourceChannelId" TEXT NOT NULL,
    "sourceChannelName" TEXT NOT NULL,
    "sourceThreadId" TEXT,
    "sourceThreadName" TEXT,
    "spellLevel" TEXT NOT NULL,
    "spellNumber" INTEGER,
    "spellName" TEXT NOT NULL,
    "titleRaw" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "school" TEXT,
    "rangeText" TEXT,
    "damage" TEXT,
    "learnText" TEXT,
    "checkText" TEXT,
    "concentration" TEXT,
    "duration" TEXT,
    "castCost" TEXT,
    "etcText" TEXT,
    "commentText" TEXT,
    "componentsText" TEXT,
    "bodyRaw" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpellEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SpellEntry_sourceMessageId_key" ON "public"."SpellEntry"("sourceMessageId");

-- CreateIndex
CREATE INDEX "SpellEntry_normalizedName_idx" ON "public"."SpellEntry"("normalizedName");

-- CreateIndex
CREATE INDEX "SpellEntry_spellLevel_idx" ON "public"."SpellEntry"("spellLevel");
