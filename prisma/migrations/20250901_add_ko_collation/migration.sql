-- Create ko-KR ICU collation if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_collation WHERE collname = 'ko_kr_icu') THEN
    CREATE COLLATION "ko_kr_icu" (provider = icu, locale = 'ko-KR');
  END IF;
END $$;

-- Apply collation to column
ALTER TABLE "ItemsInfo"
  ALTER COLUMN "name" TYPE text COLLATE "ko_kr_icu";