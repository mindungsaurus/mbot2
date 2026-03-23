-- CreateTable
CREATE TABLE "public"."WorldMap" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT,
    "imageWidth" INTEGER,
    "imageHeight" INTEGER,
    "hexSize" DOUBLE PRECISION NOT NULL,
    "originX" DOUBLE PRECISION NOT NULL,
    "originY" DOUBLE PRECISION NOT NULL,
    "cols" INTEGER NOT NULL,
    "rows" INTEGER NOT NULL,
    "orientation" TEXT NOT NULL,
    "cityGlobal" JSONB NOT NULL,
    "tileStatePresets" JSONB,
    "tileStateAssignments" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorldMap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorldMap_ownerId_idx" ON "public"."WorldMap"("ownerId");

-- AddForeignKey
ALTER TABLE "public"."WorldMap" ADD CONSTRAINT "WorldMap_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
