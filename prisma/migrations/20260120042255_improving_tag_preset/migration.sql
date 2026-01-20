-- AlterTable
ALTER TABLE "public"."TagPreset" ADD COLUMN     "colorCode" INTEGER,
ADD COLUMN     "folderId" TEXT,
ADD COLUMN     "order" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "public"."TagPresetFolder" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TagPresetFolder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TagPresetFolder_ownerId_idx" ON "public"."TagPresetFolder"("ownerId");

-- CreateIndex
CREATE INDEX "TagPresetFolder_parentId_idx" ON "public"."TagPresetFolder"("parentId");

-- CreateIndex
CREATE INDEX "TagPreset_folderId_idx" ON "public"."TagPreset"("folderId");

-- AddForeignKey
ALTER TABLE "public"."TagPreset" ADD CONSTRAINT "TagPreset_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "public"."TagPresetFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TagPresetFolder" ADD CONSTRAINT "TagPresetFolder_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TagPresetFolder" ADD CONSTRAINT "TagPresetFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "public"."TagPresetFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
