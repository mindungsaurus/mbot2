ALTER TABLE "public"."WorldMapBuildingPreset"
ADD COLUMN "folderId" TEXT;

ALTER TABLE "public"."WorldMapTileStatePreset"
ADD COLUMN "folderId" TEXT;

CREATE TABLE "public"."WorldMapPresetFolder" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorldMapPresetFolder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorldMapPresetFolder_kind_order_idx" ON "public"."WorldMapPresetFolder"("kind", "order");
