import type {
  ActorRuleResultType,
  AffinityValueType,
  CampaignParticipantRole,
  DiscordLogSourceType,
  PersonType,
  CollectionCoverageStatus,
  ArchiveConfidenceStatus,
  DiscordCollectionMode,
  DiscordCollectionStatus,
} from '@prisma/client';

export type PageQuery = {
  page?: string;
  pageSize?: string;
};

export type CreateCampaignBody = {
  name?: unknown;
};

export type UpdateCampaignBody = {
  name?: unknown;
  isActive?: unknown;
};

export type PersonListQuery = PageQuery & {
  search?: string;
  type?: PersonType;
  active?: string;
};

export type CreatePersonBody = {
  name?: unknown;
  type?: unknown;
  title?: unknown;
  shortDescription?: unknown;
  isActive?: unknown;
};

export type UpdatePersonBody = Partial<CreatePersonBody>;

export type CreatePersonAliasBody = {
  alias?: unknown;
  logSourceId?: unknown;
};

export type UpdatePersonAliasBody = Partial<CreatePersonAliasBody>;

export type UpsertAffinityBody = {
  sourcePersonId?: unknown;
  targetPersonId?: unknown;
  valueType?: unknown;
  numericValue?: unknown;
  textValue?: unknown;
  comment?: unknown;
};

export type UpdateAffinityBody = {
  valueType?: unknown;
  numericValue?: unknown;
  textValue?: unknown;
  comment?: unknown;
};

export type CreateCampaignParticipantBody = {
  discordUserId?: unknown;
  discordDisplayName?: unknown;
  role?: unknown;
  linkedPersonId?: unknown;
  webUserId?: unknown;
};

export type UpdateCampaignParticipantBody =
  Partial<CreateCampaignParticipantBody>;

export type CreateDiscordLogSourceBody = {
  guildId?: unknown;
  channelId?: unknown;
  displayName?: unknown;
  sourceType?: unknown;
  defaultPcId?: unknown;
  enabled?: unknown;
  activeFrom?: unknown;
  activeTo?: unknown;
  operatorNote?: unknown;
};

export type UpdateDiscordLogSourceBody = Partial<CreateDiscordLogSourceBody>;

export type DiscordCollectionBody = {
  mode?: unknown;
  startAt?: unknown;
  endAt?: unknown;
  incrementalMessageLimit?: unknown;
  startCursorMessageId?: unknown;
  throughMessageId?: unknown;
  scannedThroughAt?: unknown;
};

export type DiscordCollectionRunListQuery = PageQuery & {
  status?: DiscordCollectionStatus;
  mode?: DiscordCollectionMode;
};

export type ActorRuleListQuery = PageQuery & {
  search?: string;
  logSourceId?: string;
  resultType?: ActorRuleResultType;
};

export type CreateActorRuleBody = {
  pattern?: unknown;
  resultType?: unknown;
  personId?: unknown;
  logSourceId?: unknown;
  enabled?: unknown;
};

export type UpdateActorRuleBody = Partial<CreateActorRuleBody>;

export type LogSourceCoverageListQuery = {
  startAt?: string;
  endAt?: string;
};

export type StoryTimeAnchorListQuery = PageQuery & {
  campaignId?: string;
  logSourceId?: string;
  from?: string;
  to?: string;
};

export type StoryTimeAtQuery = {
  timestamp?: string;
};

export type CreateLogSourceCoverageBody = {
  startAt?: unknown;
  endAt?: unknown;
  collectionStatus?: unknown;
  archiveConfidenceStatus?: unknown;
  note?: unknown;
};

export type UpdateLogSourceCoverageBody = Partial<CreateLogSourceCoverageBody>;

export type CreateStoryTimeAnchorBody = {
  logSourceId?: unknown;
  sourceStartAt?: unknown;
  sourceEndAt?: unknown;
  storyDay?: unknown;
  storyTimeLabel?: unknown;
  note?: unknown;
};

export type UpdateStoryTimeAnchorBody = Partial<CreateStoryTimeAnchorBody>;

export const PERSON_TYPES: readonly PersonType[] = ['PC', 'NPC'];
export const AFFINITY_VALUE_TYPES: readonly AffinityValueType[] = [
  'NUMBER',
  'TEXT',
];
export const DISCORD_LOG_SOURCE_TYPES: readonly DiscordLogSourceType[] = [
  'PERSONAL',
  'JOINT',
  'GENERAL',
];
export const CAMPAIGN_PARTICIPANT_ROLES: readonly CampaignParticipantRole[] = [
  'OPERATOR',
  'PLAYER',
  'BOTH',
  'OTHER',
];
export const ACTOR_RULE_RESULT_TYPES: readonly ActorRuleResultType[] = [
  'TRACKED_PERSON',
  'GENERIC_NPC',
  'SYSTEM',
  'IGNORE',
];
export const COLLECTION_COVERAGE_STATUSES: readonly CollectionCoverageStatus[] =
  ['COMPLETE', 'PARTIAL', 'UNKNOWN'];
export const ARCHIVE_CONFIDENCE_STATUSES: readonly ArchiveConfidenceStatus[] = [
  'COMPLETE',
  'PARTIAL',
  'UNKNOWN',
];
export const DISCORD_COLLECTION_MODES: readonly DiscordCollectionMode[] = [
  'RANGE',
  'INCREMENTAL',
];
export const DISCORD_COLLECTION_STATUSES: readonly DiscordCollectionStatus[] = [
  'RUNNING',
  'SUCCEEDED',
  'PARTIAL',
  'FAILED',
];
