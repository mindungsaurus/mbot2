-- CreateTable
CREATE TABLE "CharacterClassChoiceGroup" (
    "id" TEXT NOT NULL,
    "classDefinitionId" TEXT,
    "subclassDefinitionId" TEXT,
    "level" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "selectionCount" INTEGER NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterClassChoiceGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterClassChoiceOption" (
    "id" TEXT NOT NULL,
    "choiceGroupId" TEXT NOT NULL,
    "skillEntryId" INTEGER,
    "spellEntryId" INTEGER,
    "name" TEXT,
    "description" TEXT,
    "target" "CharacterClassFeatureTarget" NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterClassChoiceOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterClassChoiceSelection" (
    "id" TEXT NOT NULL,
    "characterClassId" TEXT NOT NULL,
    "choiceGroupId" TEXT NOT NULL,
    "choiceOptionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterClassChoiceSelection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CharacterClassChoiceGroup_classDefinitionId_level_order_idx" ON "CharacterClassChoiceGroup"("classDefinitionId", "level", "order");

-- CreateIndex
CREATE INDEX "CharacterClassChoiceGroup_subclassDefinitionId_level_order_idx" ON "CharacterClassChoiceGroup"("subclassDefinitionId", "level", "order");

-- CreateIndex
CREATE INDEX "CharacterClassChoiceOption_choiceGroupId_order_idx" ON "CharacterClassChoiceOption"("choiceGroupId", "order");

-- CreateIndex
CREATE INDEX "CharacterClassChoiceOption_skillEntryId_idx" ON "CharacterClassChoiceOption"("skillEntryId");

-- CreateIndex
CREATE INDEX "CharacterClassChoiceOption_spellEntryId_idx" ON "CharacterClassChoiceOption"("spellEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterClassChoiceSelection_characterClassId_choiceOptionId_key" ON "CharacterClassChoiceSelection"("characterClassId", "choiceOptionId");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterClassChoiceSelection_characterClassId_choiceGroupId_choiceOptionId_key" ON "CharacterClassChoiceSelection"("characterClassId", "choiceGroupId", "choiceOptionId");

-- CreateIndex
CREATE INDEX "CharacterClassChoiceSelection_characterClassId_choiceGroupId_idx" ON "CharacterClassChoiceSelection"("characterClassId", "choiceGroupId");

-- CreateIndex
CREATE INDEX "CharacterClassChoiceSelection_choiceGroupId_idx" ON "CharacterClassChoiceSelection"("choiceGroupId");

-- CreateIndex
CREATE INDEX "CharacterClassChoiceSelection_choiceOptionId_idx" ON "CharacterClassChoiceSelection"("choiceOptionId");

-- AddForeignKey
ALTER TABLE "CharacterClassChoiceGroup" ADD CONSTRAINT "CharacterClassChoiceGroup_classDefinitionId_fkey" FOREIGN KEY ("classDefinitionId") REFERENCES "CharacterClassDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterClassChoiceGroup" ADD CONSTRAINT "CharacterClassChoiceGroup_subclassDefinitionId_fkey" FOREIGN KEY ("subclassDefinitionId") REFERENCES "CharacterSubclassDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterClassChoiceOption" ADD CONSTRAINT "CharacterClassChoiceOption_choiceGroupId_fkey" FOREIGN KEY ("choiceGroupId") REFERENCES "CharacterClassChoiceGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterClassChoiceOption" ADD CONSTRAINT "CharacterClassChoiceOption_skillEntryId_fkey" FOREIGN KEY ("skillEntryId") REFERENCES "SkillEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterClassChoiceOption" ADD CONSTRAINT "CharacterClassChoiceOption_spellEntryId_fkey" FOREIGN KEY ("spellEntryId") REFERENCES "SpellEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterClassChoiceSelection" ADD CONSTRAINT "CharacterClassChoiceSelection_characterClassId_fkey" FOREIGN KEY ("characterClassId") REFERENCES "CharacterClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterClassChoiceSelection" ADD CONSTRAINT "CharacterClassChoiceSelection_choiceGroupId_fkey" FOREIGN KEY ("choiceGroupId") REFERENCES "CharacterClassChoiceGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterClassChoiceSelection" ADD CONSTRAINT "CharacterClassChoiceSelection_choiceOptionId_fkey" FOREIGN KEY ("choiceOptionId") REFERENCES "CharacterClassChoiceOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;
