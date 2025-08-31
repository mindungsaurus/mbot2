/*
  Warnings:

  - A unique constraint covering the columns `[alias]` on the table `ItemAlias` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "ItemAlias_alias_key" ON "public"."ItemAlias"("alias");

-- Create ko-KR collation if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_collation WHERE collname = 'ko_kr') THEN
    CREATE COLLATION "ko_kr" (provider = icu, locale = 'ko-KR');
  END IF;
END $$;

-- Apply collation to column
ALTER TABLE "ItemsInfo"
  ALTER COLUMN "name" TYPE text COLLATE "ko_kr";

ALTER TABLE "ItemAlias"
  ALTER COLUMN "alias" TYPE text COLLATE "ko_kr";