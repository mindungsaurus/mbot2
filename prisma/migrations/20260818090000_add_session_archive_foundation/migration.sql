-- Phase 1A foundation for session archive and person history recovery.
-- This migration only adds new enums/tables and does not modify existing data.

CREATE TYPE "PersonType" AS ENUM ('PC', 'NPC');
CREATE TYPE "AffinityValueType" AS ENUM ('NUMBER', 'TEXT');
CREATE TYPE "DiscordLogSourceType" AS ENUM ('PERSONAL', 'JOINT', 'GENERAL');
CREATE TYPE "CampaignParticipantRole" AS ENUM ('OPERATOR', 'PLAYER', 'BOTH', 'OTHER');
CREATE TYPE "ActorRuleResultType" AS ENUM ('TRACKED_PERSON', 'GENERIC_NPC', 'SYSTEM', 'IGNORE');
CREATE TYPE "CollectionCoverageStatus" AS ENUM ('COMPLETE', 'PARTIAL', 'UNKNOWN');
CREATE TYPE "ArchiveConfidenceStatus" AS ENUM ('COMPLETE', 'PARTIAL', 'UNKNOWN');

CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PersonType" NOT NULL,
    "title" TEXT,
    "shortDescription" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PersonAlias" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "normalizedAlias" TEXT NOT NULL,
    "logSourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonAlias_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Affinity" (
    "id" TEXT NOT NULL,
    "sourcePersonId" TEXT NOT NULL,
    "targetPersonId" TEXT NOT NULL,
    "valueType" "AffinityValueType" NOT NULL,
    "numericValue" INTEGER,
    "textValue" TEXT,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Affinity_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Affinity_value_check" CHECK (
        ("valueType" = 'NUMBER' AND "numericValue" IS NOT NULL) OR
        ("valueType" = 'TEXT' AND "textValue" IS NOT NULL)
    ),
    CONSTRAINT "Affinity_distinct_person_check" CHECK ("sourcePersonId" <> "targetPersonId")
);

CREATE TABLE "DiscordLogSource" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "sourceType" "DiscordLogSourceType" NOT NULL,
    "defaultPcId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "activeFrom" TIMESTAMP(3),
    "activeTo" TIMESTAMP(3),
    "operatorNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscordLogSource_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DiscordLogSource_active_range_check" CHECK (
        "activeFrom" IS NULL OR "activeTo" IS NULL OR "activeFrom" <= "activeTo"
    )
);

CREATE TABLE "CampaignParticipant" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "discordUserId" TEXT NOT NULL,
    "discordDisplayName" TEXT,
    "role" "CampaignParticipantRole" NOT NULL,
    "linkedPersonId" TEXT,
    "webUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignParticipant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ActorRule" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "normalizedPattern" TEXT NOT NULL,
    "resultType" "ActorRuleResultType" NOT NULL,
    "personId" TEXT,
    "logSourceId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActorRule_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ActorRule_tracked_person_check" CHECK (
        ("resultType" = 'TRACKED_PERSON' AND "personId" IS NOT NULL) OR
        ("resultType" <> 'TRACKED_PERSON' AND "personId" IS NULL)
    )
);

CREATE TABLE "DiscordMessage" (
    "id" TEXT NOT NULL,
    "discordMessageId" TEXT NOT NULL,
    "logSourceId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "authorDiscordUserId" TEXT,
    "authorDisplayName" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "isBot" BOOLEAN NOT NULL DEFAULT false,
    "webhookId" TEXT,
    "replyToMessageId" TEXT,
    "discordEditedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscordMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DiscordMessageAttachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "discordAttachmentId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "contentType" TEXT,
    "size" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscordMessageAttachment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LogSourceCoverage" (
    "id" TEXT NOT NULL,
    "logSourceId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "collectionStatus" "CollectionCoverageStatus" NOT NULL DEFAULT 'UNKNOWN',
    "archiveConfidenceStatus" "ArchiveConfidenceStatus" NOT NULL DEFAULT 'UNKNOWN',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LogSourceCoverage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LogSourceCoverage_range_check" CHECK ("startAt" <= "endAt")
);

CREATE UNIQUE INDEX "Campaign_name_key" ON "Campaign"("name");
CREATE UNIQUE INDEX "Person_campaignId_name_key" ON "Person"("campaignId", "name");
CREATE UNIQUE INDEX "Affinity_sourcePersonId_targetPersonId_key" ON "Affinity"("sourcePersonId", "targetPersonId");
CREATE UNIQUE INDEX "DiscordLogSource_guildId_channelId_key" ON "DiscordLogSource"("guildId", "channelId");
CREATE UNIQUE INDEX "CampaignParticipant_campaignId_discordUserId_key" ON "CampaignParticipant"("campaignId", "discordUserId");
CREATE UNIQUE INDEX "DiscordMessage_discordMessageId_key" ON "DiscordMessage"("discordMessageId");
CREATE UNIQUE INDEX "DiscordMessageAttachment_messageId_discordAttachmentId_key" ON "DiscordMessageAttachment"("messageId", "discordAttachmentId");

CREATE INDEX "Person_campaignId_type_isActive_idx" ON "Person"("campaignId", "type", "isActive");
CREATE INDEX "Person_name_idx" ON "Person"("name");
CREATE INDEX "PersonAlias_personId_idx" ON "PersonAlias"("personId");
CREATE INDEX "PersonAlias_normalizedAlias_idx" ON "PersonAlias"("normalizedAlias");
CREATE INDEX "PersonAlias_logSourceId_normalizedAlias_idx" ON "PersonAlias"("logSourceId", "normalizedAlias");
CREATE INDEX "Affinity_sourcePersonId_idx" ON "Affinity"("sourcePersonId");
CREATE INDEX "Affinity_targetPersonId_idx" ON "Affinity"("targetPersonId");
CREATE INDEX "DiscordLogSource_campaignId_enabled_idx" ON "DiscordLogSource"("campaignId", "enabled");
CREATE INDEX "DiscordLogSource_defaultPcId_idx" ON "DiscordLogSource"("defaultPcId");
CREATE INDEX "CampaignParticipant_linkedPersonId_idx" ON "CampaignParticipant"("linkedPersonId");
CREATE INDEX "CampaignParticipant_webUserId_idx" ON "CampaignParticipant"("webUserId");
CREATE INDEX "ActorRule_campaignId_enabled_idx" ON "ActorRule"("campaignId", "enabled");
CREATE INDEX "ActorRule_normalizedPattern_idx" ON "ActorRule"("normalizedPattern");
CREATE INDEX "ActorRule_logSourceId_normalizedPattern_idx" ON "ActorRule"("logSourceId", "normalizedPattern");
CREATE INDEX "ActorRule_personId_idx" ON "ActorRule"("personId");
CREATE INDEX "DiscordMessage_logSourceId_timestamp_idx" ON "DiscordMessage"("logSourceId", "timestamp");
CREATE INDEX "DiscordMessage_guildId_channelId_timestamp_idx" ON "DiscordMessage"("guildId", "channelId", "timestamp");
CREATE INDEX "DiscordMessage_authorDiscordUserId_idx" ON "DiscordMessage"("authorDiscordUserId");
CREATE INDEX "DiscordMessage_replyToMessageId_idx" ON "DiscordMessage"("replyToMessageId");
CREATE INDEX "DiscordMessageAttachment_messageId_idx" ON "DiscordMessageAttachment"("messageId");
CREATE INDEX "LogSourceCoverage_logSourceId_startAt_endAt_idx" ON "LogSourceCoverage"("logSourceId", "startAt", "endAt");
CREATE INDEX "LogSourceCoverage_collectionStatus_idx" ON "LogSourceCoverage"("collectionStatus");
CREATE INDEX "LogSourceCoverage_archiveConfidenceStatus_idx" ON "LogSourceCoverage"("archiveConfidenceStatus");

ALTER TABLE "Person" ADD CONSTRAINT "Person_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PersonAlias" ADD CONSTRAINT "PersonAlias_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PersonAlias" ADD CONSTRAINT "PersonAlias_logSourceId_fkey" FOREIGN KEY ("logSourceId") REFERENCES "DiscordLogSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Affinity" ADD CONSTRAINT "Affinity_sourcePersonId_fkey" FOREIGN KEY ("sourcePersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Affinity" ADD CONSTRAINT "Affinity_targetPersonId_fkey" FOREIGN KEY ("targetPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DiscordLogSource" ADD CONSTRAINT "DiscordLogSource_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DiscordLogSource" ADD CONSTRAINT "DiscordLogSource_defaultPcId_fkey" FOREIGN KEY ("defaultPcId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CampaignParticipant" ADD CONSTRAINT "CampaignParticipant_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CampaignParticipant" ADD CONSTRAINT "CampaignParticipant_linkedPersonId_fkey" FOREIGN KEY ("linkedPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CampaignParticipant" ADD CONSTRAINT "CampaignParticipant_webUserId_fkey" FOREIGN KEY ("webUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ActorRule" ADD CONSTRAINT "ActorRule_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActorRule" ADD CONSTRAINT "ActorRule_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActorRule" ADD CONSTRAINT "ActorRule_logSourceId_fkey" FOREIGN KEY ("logSourceId") REFERENCES "DiscordLogSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DiscordMessage" ADD CONSTRAINT "DiscordMessage_logSourceId_fkey" FOREIGN KEY ("logSourceId") REFERENCES "DiscordLogSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DiscordMessageAttachment" ADD CONSTRAINT "DiscordMessageAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "DiscordMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LogSourceCoverage" ADD CONSTRAINT "LogSourceCoverage_logSourceId_fkey" FOREIGN KEY ("logSourceId") REFERENCES "DiscordLogSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
