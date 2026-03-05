/*
  Warnings:

  - A unique constraint covering the columns `[spellKey]` on the table `SpellEntry` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `spellKey` to the `SpellEntry` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."SpellEntry" ADD COLUMN     "spellKey" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "SpellEntry_spellKey_key" ON "public"."SpellEntry"("spellKey");
