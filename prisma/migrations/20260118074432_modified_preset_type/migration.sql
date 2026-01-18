-- AlterTable
ALTER TABLE "public"."UnitPreset" ADD COLUMN     "order" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "public"."UnitPresetFolder" ADD COLUMN     "parentId" TEXT;

-- CreateIndex
CREATE INDEX "UnitPresetFolder_parentId_idx" ON "public"."UnitPresetFolder"("parentId");

-- AddForeignKey
ALTER TABLE "public"."UnitPresetFolder" ADD CONSTRAINT "UnitPresetFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "public"."UnitPresetFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
