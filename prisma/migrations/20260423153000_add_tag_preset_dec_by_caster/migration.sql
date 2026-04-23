-- Add caster-based stack decay option for tag presets
ALTER TABLE "TagPreset"
ADD COLUMN "decByCaster" BOOLEAN NOT NULL DEFAULT false;
