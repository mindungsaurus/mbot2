-- CreateEnum
CREATE TYPE "CharacterClassFeatureTarget" AS ENUM ('TRAIT', 'FEAT', 'TECHNIQUE', 'SPELL', 'METAMAGIC', 'FIGHTING_STYLE', 'RESOURCE_OR_SLOT', 'CUSTOM');

-- CreateTable
CREATE TABLE "CharacterClassFeatureDefinition" (
    "id" TEXT NOT NULL,
    "classDefinitionId" TEXT,
    "subclassDefinitionId" TEXT,
    "level" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "target" "CharacterClassFeatureTarget" NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterClassFeatureDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CharacterClassFeatureDefinition_classDefinitionId_level_order_idx" ON "CharacterClassFeatureDefinition"("classDefinitionId", "level", "order");

-- CreateIndex
CREATE INDEX "CharacterClassFeatureDefinition_subclassDefinitionId_level_order_idx" ON "CharacterClassFeatureDefinition"("subclassDefinitionId", "level", "order");

-- AddForeignKey
ALTER TABLE "CharacterClassFeatureDefinition" ADD CONSTRAINT "CharacterClassFeatureDefinition_classDefinitionId_fkey" FOREIGN KEY ("classDefinitionId") REFERENCES "CharacterClassDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterClassFeatureDefinition" ADD CONSTRAINT "CharacterClassFeatureDefinition_subclassDefinitionId_fkey" FOREIGN KEY ("subclassDefinitionId") REFERENCES "CharacterSubclassDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddConstraint
ALTER TABLE "CharacterClassFeatureDefinition" ADD CONSTRAINT "CharacterClassFeatureDefinition_single_owner_check" CHECK (
    ("classDefinitionId" IS NOT NULL AND "subclassDefinitionId" IS NULL)
    OR
    ("classDefinitionId" IS NULL AND "subclassDefinitionId" IS NOT NULL)
);

-- AddConstraint
ALTER TABLE "CharacterClassFeatureDefinition" ADD CONSTRAINT "CharacterClassFeatureDefinition_positive_level_check" CHECK ("level" > 0);
