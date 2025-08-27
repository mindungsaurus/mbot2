/*
  Warnings:

  - The `quality` column on the `ItemsInfo` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "public"."ItemsInfo" DROP COLUMN "quality",
ADD COLUMN     "quality" INTEGER;
