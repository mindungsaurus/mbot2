-- CreateTable
CREATE TABLE "public"."TagPreset" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "decOnTurnStart" BOOLEAN NOT NULL DEFAULT false,
    "decOnTurnEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TagPreset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TagPreset_ownerId_idx" ON "public"."TagPreset"("ownerId");

-- AddForeignKey
ALTER TABLE "public"."TagPreset" ADD CONSTRAINT "TagPreset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
