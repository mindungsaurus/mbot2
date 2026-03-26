-- CreateTable
CREATE TABLE "public"."WorldMapTileStatePreset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "hasValue" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorldMapTileStatePreset_pkey" PRIMARY KEY ("id")
);

-- Allow shared building presets (mapId = NULL)
ALTER TABLE "public"."WorldMapBuildingPreset"
ALTER COLUMN "mapId" DROP NOT NULL;