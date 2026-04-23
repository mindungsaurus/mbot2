ALTER TABLE "public"."WorldMapPresetFolder"
ADD COLUMN "parentId" TEXT;

CREATE INDEX "WorldMapPresetFolder_parentId_idx" ON "public"."WorldMapPresetFolder"("parentId");

ALTER TABLE "public"."WorldMapPresetFolder"
ADD CONSTRAINT "WorldMapPresetFolder_parentId_fkey"
FOREIGN KEY ("parentId") REFERENCES "public"."WorldMapPresetFolder"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
