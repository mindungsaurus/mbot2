CREATE TYPE "CharacterClassAdditionalRewardType" AS ENUM (
    'TRAIT',
    'FEAT',
    'TECHNIQUE',
    'SPELL',
    'GRANT_FEATURE',
    'GRANT_CHOICE_OPTION',
    'GRANT_UNACQUIRED_CHOICE_OPTIONS'
);

CREATE TABLE "CharacterClassAdditionalReward" (
    "id" TEXT NOT NULL,
    "featureDefinitionId" TEXT,
    "choiceOptionId" TEXT,
    "rewardType" "CharacterClassAdditionalRewardType" NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "skillEntryId" INTEGER,
    "spellEntryId" INTEGER,
    "referencedFeatureDefinitionId" TEXT,
    "referencedChoiceOptionId" TEXT,
    "referencedChoiceGroupId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterClassAdditionalReward_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CharacterClassAdditionalReward_parent_check" CHECK (
        ("featureDefinitionId" IS NOT NULL AND "choiceOptionId" IS NULL) OR
        ("featureDefinitionId" IS NULL AND "choiceOptionId" IS NOT NULL)
    ),
    CONSTRAINT "CharacterClassAdditionalReward_payload_check" CHECK (
        (
            "rewardType" IN ('TRAIT', 'FEAT') AND
            "name" IS NOT NULL AND
            "skillEntryId" IS NULL AND
            "spellEntryId" IS NULL AND
            "referencedFeatureDefinitionId" IS NULL AND
            "referencedChoiceOptionId" IS NULL AND
            "referencedChoiceGroupId" IS NULL
        ) OR (
            "rewardType" = 'TECHNIQUE' AND
            "skillEntryId" IS NOT NULL AND
            "spellEntryId" IS NULL AND
            "referencedFeatureDefinitionId" IS NULL AND
            "referencedChoiceOptionId" IS NULL AND
            "referencedChoiceGroupId" IS NULL
        ) OR (
            "rewardType" = 'SPELL' AND
            "skillEntryId" IS NULL AND
            "spellEntryId" IS NOT NULL AND
            "referencedFeatureDefinitionId" IS NULL AND
            "referencedChoiceOptionId" IS NULL AND
            "referencedChoiceGroupId" IS NULL
        ) OR (
            "rewardType" = 'GRANT_FEATURE' AND
            "skillEntryId" IS NULL AND
            "spellEntryId" IS NULL AND
            "referencedFeatureDefinitionId" IS NOT NULL AND
            "referencedChoiceOptionId" IS NULL AND
            "referencedChoiceGroupId" IS NULL
        ) OR (
            "rewardType" = 'GRANT_CHOICE_OPTION' AND
            "skillEntryId" IS NULL AND
            "spellEntryId" IS NULL AND
            "referencedFeatureDefinitionId" IS NULL AND
            "referencedChoiceOptionId" IS NOT NULL AND
            "referencedChoiceGroupId" IS NULL
        ) OR (
            "rewardType" = 'GRANT_UNACQUIRED_CHOICE_OPTIONS' AND
            "skillEntryId" IS NULL AND
            "spellEntryId" IS NULL AND
            "referencedFeatureDefinitionId" IS NULL AND
            "referencedChoiceOptionId" IS NULL AND
            "referencedChoiceGroupId" IS NOT NULL
        )
    )
);

CREATE INDEX "CharacterClassAdditionalReward_featureDefinitionId_order_idx" ON "CharacterClassAdditionalReward"("featureDefinitionId", "order");
CREATE INDEX "CharacterClassAdditionalReward_choiceOptionId_order_idx" ON "CharacterClassAdditionalReward"("choiceOptionId", "order");
CREATE INDEX "CharacterClassAdditionalReward_skillEntryId_idx" ON "CharacterClassAdditionalReward"("skillEntryId");
CREATE INDEX "CharacterClassAdditionalReward_spellEntryId_idx" ON "CharacterClassAdditionalReward"("spellEntryId");
CREATE INDEX "CharacterClassAdditionalReward_referencedFeatureDefinitionId_idx" ON "CharacterClassAdditionalReward"("referencedFeatureDefinitionId");
CREATE INDEX "CharacterClassAdditionalReward_referencedChoiceOptionId_idx" ON "CharacterClassAdditionalReward"("referencedChoiceOptionId");
CREATE INDEX "CharacterClassAdditionalReward_referencedChoiceGroupId_idx" ON "CharacterClassAdditionalReward"("referencedChoiceGroupId");

ALTER TABLE "CharacterClassAdditionalReward" ADD CONSTRAINT "CharacterClassAdditionalReward_featureDefinitionId_fkey" FOREIGN KEY ("featureDefinitionId") REFERENCES "CharacterClassFeatureDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CharacterClassAdditionalReward" ADD CONSTRAINT "CharacterClassAdditionalReward_choiceOptionId_fkey" FOREIGN KEY ("choiceOptionId") REFERENCES "CharacterClassChoiceOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CharacterClassAdditionalReward" ADD CONSTRAINT "CharacterClassAdditionalReward_skillEntryId_fkey" FOREIGN KEY ("skillEntryId") REFERENCES "SkillEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CharacterClassAdditionalReward" ADD CONSTRAINT "CharacterClassAdditionalReward_spellEntryId_fkey" FOREIGN KEY ("spellEntryId") REFERENCES "SpellEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CharacterClassAdditionalReward" ADD CONSTRAINT "CharacterClassAdditionalReward_referencedFeatureDefinitionId_fkey" FOREIGN KEY ("referencedFeatureDefinitionId") REFERENCES "CharacterClassFeatureDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CharacterClassAdditionalReward" ADD CONSTRAINT "CharacterClassAdditionalReward_referencedChoiceOptionId_fkey" FOREIGN KEY ("referencedChoiceOptionId") REFERENCES "CharacterClassChoiceOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CharacterClassAdditionalReward" ADD CONSTRAINT "CharacterClassAdditionalReward_referencedChoiceGroupId_fkey" FOREIGN KEY ("referencedChoiceGroupId") REFERENCES "CharacterClassChoiceGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
