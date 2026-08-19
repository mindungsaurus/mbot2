-- CreateEnum
CREATE TYPE "CharacterFeatureVisibilityOverride" AS ENUM ('DEFAULT', 'FORCE_SHOW', 'FORCE_HIDE');

-- AlterTable
ALTER TABLE "CharacterClassFeatureDefinition" ADD COLUMN "defaultSheetVisible" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "CharacterClassChoiceOption" ADD COLUMN "defaultSheetVisible" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "CharacterFeatureOverride" (
    "id" TEXT NOT NULL,
    "characterSheetId" TEXT NOT NULL,
    "targetFeatureDefinitionId" TEXT,
    "targetChoiceOptionId" TEXT,
    "visibility" "CharacterFeatureVisibilityOverride" NOT NULL DEFAULT 'DEFAULT',
    "suppressed" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterFeatureOverride_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CharacterFeatureOverride_one_target_check" CHECK (
      ("targetFeatureDefinitionId" IS NOT NULL AND "targetChoiceOptionId" IS NULL)
      OR
      ("targetFeatureDefinitionId" IS NULL AND "targetChoiceOptionId" IS NOT NULL)
    )
);

-- CreateIndex
CREATE INDEX "CharacterFeatureOverride_characterSheetId_idx" ON "CharacterFeatureOverride"("characterSheetId");

-- CreateIndex
CREATE INDEX "CharacterFeatureOverride_targetFeatureDefinitionId_idx" ON "CharacterFeatureOverride"("targetFeatureDefinitionId");

-- CreateIndex
CREATE INDEX "CharacterFeatureOverride_targetChoiceOptionId_idx" ON "CharacterFeatureOverride"("targetChoiceOptionId");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterFeatureOverride_character_feature_unique" ON "CharacterFeatureOverride"("characterSheetId", "targetFeatureDefinitionId") WHERE "targetFeatureDefinitionId" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "CharacterFeatureOverride_character_choice_unique" ON "CharacterFeatureOverride"("characterSheetId", "targetChoiceOptionId") WHERE "targetChoiceOptionId" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "CharacterFeatureOverride" ADD CONSTRAINT "CharacterFeatureOverride_characterSheetId_fkey" FOREIGN KEY ("characterSheetId") REFERENCES "CharacterSheet"("characterName") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterFeatureOverride" ADD CONSTRAINT "CharacterFeatureOverride_targetFeatureDefinitionId_fkey" FOREIGN KEY ("targetFeatureDefinitionId") REFERENCES "CharacterClassFeatureDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterFeatureOverride" ADD CONSTRAINT "CharacterFeatureOverride_targetChoiceOptionId_fkey" FOREIGN KEY ("targetChoiceOptionId") REFERENCES "CharacterClassChoiceOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;
