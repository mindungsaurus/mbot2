/*
  Warnings:

  - A unique constraint covering the columns `[alias]` on the table `ItemAlias` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "ItemAlias_alias_key" ON "public"."ItemAlias"("alias");