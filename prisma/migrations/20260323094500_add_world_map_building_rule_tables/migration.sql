-- CreateTable
CREATE TABLE "public"."WorldMapBuildingPreset" (
    "id" TEXT NOT NULL,
    "mapId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "tier" TEXT,
    "effort" INTEGER,
    "space" INTEGER,
    "description" TEXT,
    "placementRules" JSONB,
    "buildCost" JSONB,
    "researchCost" JSONB,
    "upkeep" JSONB,
    "effects" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorldMapBuildingPreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorldMapBuildingInstance" (
    "id" TEXT NOT NULL,
    "mapId" TEXT NOT NULL,
    "presetId" TEXT NOT NULL,
    "col" INTEGER NOT NULL,
    "row" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "progressEffort" INTEGER NOT NULL DEFAULT 0,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorldMapBuildingInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorldMapTickLog" (
    "id" TEXT NOT NULL,
    "mapId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "summary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorldMapTickLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorldMapBuildingPreset_mapId_idx" ON "public"."WorldMapBuildingPreset"("mapId");

-- CreateIndex
CREATE INDEX "WorldMapBuildingPreset_mapId_name_idx" ON "public"."WorldMapBuildingPreset"("mapId", "name");

-- CreateIndex
CREATE INDEX "WorldMapBuildingInstance_mapId_idx" ON "public"."WorldMapBuildingInstance"("mapId");

-- CreateIndex
CREATE INDEX "WorldMapBuildingInstance_mapId_col_row_idx" ON "public"."WorldMapBuildingInstance"("mapId", "col", "row");

-- CreateIndex
CREATE INDEX "WorldMapBuildingInstance_presetId_idx" ON "public"."WorldMapBuildingInstance"("presetId");

-- CreateIndex
CREATE INDEX "WorldMapTickLog_mapId_day_idx" ON "public"."WorldMapTickLog"("mapId", "day");

-- AddForeignKey
ALTER TABLE "public"."WorldMapBuildingPreset" ADD CONSTRAINT "WorldMapBuildingPreset_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "public"."WorldMap"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorldMapBuildingInstance" ADD CONSTRAINT "WorldMapBuildingInstance_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "public"."WorldMap"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorldMapBuildingInstance" ADD CONSTRAINT "WorldMapBuildingInstance_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "public"."WorldMapBuildingPreset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorldMapTickLog" ADD CONSTRAINT "WorldMapTickLog_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "public"."WorldMap"("id") ON DELETE CASCADE ON UPDATE CASCADE;
