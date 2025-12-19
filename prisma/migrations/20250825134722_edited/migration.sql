/*
  Warnings:

  - A unique constraint covering the columns `[noSpace]` on the table `ItemsInfo` will be added. If there are existing duplicate values, this will fail.
  - Made the column `noSpace` on table `ItemsInfo` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "public"."ItemsInfo" ALTER COLUMN "noSpace" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ItemsInfo_noSpace_key" ON "public"."ItemsInfo"("noSpace");
