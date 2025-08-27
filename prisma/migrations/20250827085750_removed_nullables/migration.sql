/*
  Warnings:

  - Made the column `unit` on table `ItemsInfo` required. This step will fail if there are existing NULL values in that column.
  - Made the column `type` on table `ItemsInfo` required. This step will fail if there are existing NULL values in that column.
  - Made the column `quality` on table `ItemsInfo` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "public"."ItemsInfo" ALTER COLUMN "unit" SET NOT NULL,
ALTER COLUMN "type" SET NOT NULL,
ALTER COLUMN "quality" SET NOT NULL;
