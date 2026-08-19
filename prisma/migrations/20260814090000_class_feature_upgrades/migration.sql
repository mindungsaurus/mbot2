-- CreateTable
CREATE TABLE "CharacterClassFeatureUpgrade" (
    "id" TEXT NOT NULL,
    "targetFeatureDefinitionId" TEXT,
    "targetChoiceOptionId" TEXT,
    "branchOptionId" TEXT,
    "unlockLevel" INTEGER NOT NULL,
    "name" TEXT,
    "description" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterClassFeatureUpgrade_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CharacterClassFeatureUpgrade_one_target_check" CHECK (
      ("targetFeatureDefinitionId" IS NOT NULL AND "targetChoiceOptionId" IS NULL)
      OR
      ("targetFeatureDefinitionId" IS NULL AND "targetChoiceOptionId" IS NOT NULL)
    )
);

-- CreateIndex
CREATE INDEX "CharacterClassFeatureUpgrade_targetFeatureDefinitionId_unlock_idx" ON "CharacterClassFeatureUpgrade"("targetFeatureDefinitionId", "unlockLevel", "displayOrder");

-- CreateIndex
CREATE INDEX "CharacterClassFeatureUpgrade_targetChoiceOptionId_unlock_idx" ON "CharacterClassFeatureUpgrade"("targetChoiceOptionId", "unlockLevel", "displayOrder");

-- CreateIndex
CREATE INDEX "CharacterClassFeatureUpgrade_branchOptionId_idx" ON "CharacterClassFeatureUpgrade"("branchOptionId");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterClassFeatureUpgrade_feature_null_branch_unique" ON "CharacterClassFeatureUpgrade"("targetFeatureDefinitionId", "unlockLevel") WHERE "targetFeatureDefinitionId" IS NOT NULL AND "branchOptionId" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "CharacterClassFeatureUpgrade_feature_branch_unique" ON "CharacterClassFeatureUpgrade"("targetFeatureDefinitionId", "unlockLevel", "branchOptionId") WHERE "targetFeatureDefinitionId" IS NOT NULL AND "branchOptionId" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "CharacterClassFeatureUpgrade_choice_null_branch_unique" ON "CharacterClassFeatureUpgrade"("targetChoiceOptionId", "unlockLevel") WHERE "targetChoiceOptionId" IS NOT NULL AND "branchOptionId" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "CharacterClassFeatureUpgrade_choice_branch_unique" ON "CharacterClassFeatureUpgrade"("targetChoiceOptionId", "unlockLevel", "branchOptionId") WHERE "targetChoiceOptionId" IS NOT NULL AND "branchOptionId" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "CharacterClassFeatureUpgrade" ADD CONSTRAINT "CharacterClassFeatureUpgrade_targetFeatureDefinitionId_fkey" FOREIGN KEY ("targetFeatureDefinitionId") REFERENCES "CharacterClassFeatureDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterClassFeatureUpgrade" ADD CONSTRAINT "CharacterClassFeatureUpgrade_targetChoiceOptionId_fkey" FOREIGN KEY ("targetChoiceOptionId") REFERENCES "CharacterClassChoiceOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterClassFeatureUpgrade" ADD CONSTRAINT "CharacterClassFeatureUpgrade_branchOptionId_fkey" FOREIGN KEY ("branchOptionId") REFERENCES "ProgressionBranchOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;
