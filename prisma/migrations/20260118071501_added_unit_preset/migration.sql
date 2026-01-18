-- CreateTable
CREATE TABLE "public"."UnitPresetFolder" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnitPresetFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UnitPreset" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "folderId" TEXT,
    "name" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnitPreset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UnitPresetFolder_ownerId_idx" ON "public"."UnitPresetFolder"("ownerId");

-- CreateIndex
CREATE INDEX "UnitPreset_ownerId_idx" ON "public"."UnitPreset"("ownerId");

-- CreateIndex
CREATE INDEX "UnitPreset_folderId_idx" ON "public"."UnitPreset"("folderId");

-- AddForeignKey
ALTER TABLE "public"."UnitPresetFolder" ADD CONSTRAINT "UnitPresetFolder_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UnitPreset" ADD CONSTRAINT "UnitPreset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UnitPreset" ADD CONSTRAINT "UnitPreset_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "public"."UnitPresetFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
