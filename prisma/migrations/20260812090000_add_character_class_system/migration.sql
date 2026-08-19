-- CreateEnum
CREATE TYPE "CasterProgression" AS ENUM ('NONE', 'FULL', 'HALF', 'THIRD');

-- CreateTable
CREATE TABLE "CharacterClassDefinition" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subclassChoiceLevel" INTEGER,
    "casterProgression" "CasterProgression" NOT NULL DEFAULT 'NONE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterClassDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterSubclassDefinition" (
    "id" TEXT NOT NULL,
    "classDefinitionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterSubclassDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterClass" (
    "id" TEXT NOT NULL,
    "characterSheetId" TEXT NOT NULL,
    "classDefinitionId" TEXT NOT NULL,
    "subclassDefinitionId" TEXT,
    "level" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterClass_pkey" PRIMARY KEY ("id")
);

-- Backfill class definitions from legacy CharacterSheet.className.
INSERT INTO "CharacterClassDefinition" (
    "id",
    "name",
    "subclassChoiceLevel",
    "casterProgression",
    "createdAt",
    "updatedAt"
)
SELECT DISTINCT
    'legacy-class-' || md5(trim("className")),
    trim("className"),
    NULL::INTEGER,
    'NONE'::"CasterProgression",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "CharacterSheet"
WHERE trim(coalesce("className", '')) <> '';

-- Backfill subclass definitions from legacy CharacterSheet.subclassName.
INSERT INTO "CharacterSubclassDefinition" (
    "id",
    "classDefinitionId",
    "name",
    "createdAt",
    "updatedAt"
)
SELECT DISTINCT
    'legacy-subclass-' || md5(trim("className") || '|' || trim("subclassName")),
    'legacy-class-' || md5(trim("className")),
    trim("subclassName"),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "CharacterSheet"
WHERE trim(coalesce("className", '')) <> ''
  AND trim(coalesce("subclassName", '')) <> '';

-- Backfill character class rows. Invalid or empty legacy levels become Lv.1
-- because the new relation requires a positive integer level.
INSERT INTO "CharacterClass" (
    "id",
    "characterSheetId",
    "classDefinitionId",
    "subclassDefinitionId",
    "level",
    "createdAt",
    "updatedAt"
)
SELECT
    'legacy-character-class-' || md5("characterName" || '|' || trim("className")),
    "id",
    'legacy-class-' || md5(trim("className")),
    CASE
        WHEN trim(coalesce("subclassName", '')) <> ''
        THEN 'legacy-subclass-' || md5(trim("className") || '|' || trim("subclassName"))
        ELSE NULL
    END,
    CASE
        WHEN "level" IS NOT NULL AND "level" > 0 THEN "level"
        ELSE 1
    END,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "CharacterSheet"
WHERE trim(coalesce("className", '')) <> '';

-- CreateIndex
CREATE UNIQUE INDEX "CharacterClassDefinition_name_key" ON "CharacterClassDefinition"("name");
CREATE INDEX "CharacterClassDefinition_name_idx" ON "CharacterClassDefinition"("name");
CREATE UNIQUE INDEX "CharacterSubclassDefinition_classDefinitionId_name_key" ON "CharacterSubclassDefinition"("classDefinitionId", "name");
CREATE INDEX "CharacterSubclassDefinition_classDefinitionId_idx" ON "CharacterSubclassDefinition"("classDefinitionId");
CREATE UNIQUE INDEX "CharacterClass_characterSheetId_classDefinitionId_key" ON "CharacterClass"("characterSheetId", "classDefinitionId");
CREATE INDEX "CharacterClass_classDefinitionId_idx" ON "CharacterClass"("classDefinitionId");
CREATE INDEX "CharacterClass_subclassDefinitionId_idx" ON "CharacterClass"("subclassDefinitionId");

-- AddForeignKey
ALTER TABLE "CharacterSubclassDefinition"
ADD CONSTRAINT "CharacterSubclassDefinition_classDefinitionId_fkey"
FOREIGN KEY ("classDefinitionId") REFERENCES "CharacterClassDefinition"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CharacterClass"
ADD CONSTRAINT "CharacterClass_characterSheetId_fkey"
FOREIGN KEY ("characterSheetId") REFERENCES "CharacterSheet"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CharacterClass"
ADD CONSTRAINT "CharacterClass_classDefinitionId_fkey"
FOREIGN KEY ("classDefinitionId") REFERENCES "CharacterClassDefinition"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CharacterClass"
ADD CONSTRAINT "CharacterClass_subclassDefinitionId_fkey"
FOREIGN KEY ("subclassDefinitionId") REFERENCES "CharacterSubclassDefinition"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Drop legacy single-class source-of-truth columns.
ALTER TABLE "CharacterSheet"
DROP COLUMN "level",
DROP COLUMN "className",
DROP COLUMN "subclassName";
