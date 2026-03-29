-- Add tile memo storage for world map tiles
ALTER TABLE "WorldMap"
ADD COLUMN IF NOT EXISTS "tileMemos" JSONB;
