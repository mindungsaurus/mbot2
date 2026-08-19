-- AlterTable
ALTER TABLE "CharacterClassFeatureDefinition" ADD COLUMN "skillEntryId" INTEGER;
ALTER TABLE "CharacterClassFeatureDefinition" ADD COLUMN "spellEntryId" INTEGER;

-- CreateIndex
CREATE INDEX "CharacterClassFeatureDefinition_skillEntryId_idx" ON "CharacterClassFeatureDefinition"("skillEntryId");

-- CreateIndex
CREATE INDEX "CharacterClassFeatureDefinition_spellEntryId_idx" ON "CharacterClassFeatureDefinition"("spellEntryId");

-- AddForeignKey
ALTER TABLE "CharacterClassFeatureDefinition" ADD CONSTRAINT "CharacterClassFeatureDefinition_skillEntryId_fkey" FOREIGN KEY ("skillEntryId") REFERENCES "SkillEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterClassFeatureDefinition" ADD CONSTRAINT "CharacterClassFeatureDefinition_spellEntryId_fkey" FOREIGN KEY ("spellEntryId") REFERENCES "SpellEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
