-- Normalize legacy webhook messages so authorDiscordUserId remains reserved
-- for real Discord user messages. This data migration is idempotent.
UPDATE "DiscordMessage"
SET "authorDiscordUserId" = NULL
WHERE "webhookId" IS NOT NULL
  AND "authorDiscordUserId" IS NOT NULL;
