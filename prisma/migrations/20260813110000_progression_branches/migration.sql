-- Add long-term progression branch definitions and character branch selections.
CREATE TABLE "ProgressionBranchGroup" (
    "id" TEXT NOT NULL,
    "classDefinitionId" TEXT,
    "subclassDefinitionId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unlockLevel" INTEGER NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgressionBranchGroup_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProgressionBranchGroup_owner_check" CHECK (
        ("classDefinitionId" IS NOT NULL AND "subclassDefinitionId" IS NULL) OR
        ("classDefinitionId" IS NULL AND "subclassDefinitionId" IS NOT NULL)
    )
);

CREATE TABLE "ProgressionBranchOption" (
    "id" TEXT NOT NULL,
    "branchGroupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgressionBranchOption_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CharacterClassBranchSelection" (
    "id" TEXT NOT NULL,
    "characterClassId" TEXT NOT NULL,
    "branchGroupId" TEXT NOT NULL,
    "branchOptionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterClassBranchSelection_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CharacterClassFeatureDefinition" ADD COLUMN "branchOptionId" TEXT;
ALTER TABLE "CharacterClassChoiceGroup" ADD COLUMN "branchOptionId" TEXT;

CREATE INDEX "ProgressionBranchGroup_classDefinitionId_unlockLevel_displayOrder_idx" ON "ProgressionBranchGroup"("classDefinitionId", "unlockLevel", "displayOrder");
CREATE INDEX "ProgressionBranchGroup_subclassDefinitionId_unlockLevel_displayOrder_idx" ON "ProgressionBranchGroup"("subclassDefinitionId", "unlockLevel", "displayOrder");
CREATE INDEX "ProgressionBranchOption_branchGroupId_displayOrder_idx" ON "ProgressionBranchOption"("branchGroupId", "displayOrder");
CREATE UNIQUE INDEX "CharacterClassBranchSelection_characterClassId_branchGroupId_key" ON "CharacterClassBranchSelection"("characterClassId", "branchGroupId");
CREATE INDEX "CharacterClassBranchSelection_branchGroupId_idx" ON "CharacterClassBranchSelection"("branchGroupId");
CREATE INDEX "CharacterClassBranchSelection_branchOptionId_idx" ON "CharacterClassBranchSelection"("branchOptionId");
CREATE INDEX "CharacterClassFeatureDefinition_branchOptionId_idx" ON "CharacterClassFeatureDefinition"("branchOptionId");
CREATE INDEX "CharacterClassChoiceGroup_branchOptionId_idx" ON "CharacterClassChoiceGroup"("branchOptionId");

ALTER TABLE "ProgressionBranchGroup" ADD CONSTRAINT "ProgressionBranchGroup_classDefinitionId_fkey" FOREIGN KEY ("classDefinitionId") REFERENCES "CharacterClassDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgressionBranchGroup" ADD CONSTRAINT "ProgressionBranchGroup_subclassDefinitionId_fkey" FOREIGN KEY ("subclassDefinitionId") REFERENCES "CharacterSubclassDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgressionBranchOption" ADD CONSTRAINT "ProgressionBranchOption_branchGroupId_fkey" FOREIGN KEY ("branchGroupId") REFERENCES "ProgressionBranchGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CharacterClassBranchSelection" ADD CONSTRAINT "CharacterClassBranchSelection_characterClassId_fkey" FOREIGN KEY ("characterClassId") REFERENCES "CharacterClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CharacterClassBranchSelection" ADD CONSTRAINT "CharacterClassBranchSelection_branchGroupId_fkey" FOREIGN KEY ("branchGroupId") REFERENCES "ProgressionBranchGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CharacterClassBranchSelection" ADD CONSTRAINT "CharacterClassBranchSelection_branchOptionId_fkey" FOREIGN KEY ("branchOptionId") REFERENCES "ProgressionBranchOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CharacterClassFeatureDefinition" ADD CONSTRAINT "CharacterClassFeatureDefinition_branchOptionId_fkey" FOREIGN KEY ("branchOptionId") REFERENCES "ProgressionBranchOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CharacterClassChoiceGroup" ADD CONSTRAINT "CharacterClassChoiceGroup_branchOptionId_fkey" FOREIGN KEY ("branchOptionId") REFERENCES "ProgressionBranchOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;
