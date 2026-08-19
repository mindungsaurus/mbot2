import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  CollectionCoverageStatus,
  DiscordCollectionMode,
  DiscordCollectionStatus,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import {
  Client,
  PermissionFlagsBits,
  SnowflakeUtil,
  type Message,
} from 'discord.js';
import {
  DISCORD_COLLECTION_MODES,
  DISCORD_COLLECTION_STATUSES,
  DiscordCollectionBody,
  DiscordCollectionRunListQuery,
} from './session-archive.dto';

type ResolvedCollectionRange = {
  mode: DiscordCollectionMode;
  requestedStartAt: Date | null;
  requestedEndAt: Date | null;
  resolvedStartAt: Date;
  resolvedEndAt: Date;
  exclusiveAfterMessageId?: string;
  exclusiveAfterTimestamp?: Date;
  incrementalMessageLimit?: number;
  startCursorMessageId?: string | null;
  throughMessageId?: string | null;
  scannedThroughAt?: Date | null;
  hasFixedIncrementalBoundary?: boolean;
};

type DiscordMessageRecord = {
  discordMessageId: string;
  logSourceId: string;
  guildId: string;
  channelId: string;
  authorDiscordUserId: string | null;
  authorDisplayName: string;
  content: string;
  timestamp: Date;
  isBot: boolean;
  webhookId: string | null;
  replyToMessageId: string | null;
  discordEditedAt: Date | null;
  messageType: number | null;
  embedsJson: Prisma.InputJsonValue | null;
  attachments: DiscordAttachmentRecord[];
};

type DiscordAttachmentRecord = {
  discordAttachmentId: string;
  filename: string;
  url: string;
  contentType: string | null;
  size: number | null;
};

type CollectionStats = {
  fetchedCount: number;
  newCount: number;
  updatedCount: number;
  unchangedCount: number;
  attachmentCount: number;
  firstMessageAt: Date | null;
  lastMessageAt: Date | null;
  lastCursorMessageId: string | null;
};

type ExistingDiscordMessage = Prisma.DiscordMessageGetPayload<{
  include: { attachments: true };
}>;

type PreviewStats = CollectionStats & {
  totalMessages: number;
  alreadyStoredMessages: number;
  newMessages: number;
  existingChangedCandidateCount: number;
  hasMore?: boolean;
};

const DISCORD_PAGE_LIMIT = 100;
const DEFAULT_INCREMENTAL_MESSAGE_LIMIT = 5000;
const MAX_INCREMENTAL_MESSAGE_LIMIT = 10000;

@Injectable()
export class SessionArchiveCollectionService {
  private readonly logger = new Logger(SessionArchiveCollectionService.name);

  constructor(
    private readonly prisma: PrismaClient,
    @Optional() @Inject(Client) private readonly client?: Client,
  ) {}

  async previewLogSourceCollection(
    logSourceId: string,
    body: DiscordCollectionBody,
  ) {
    const source = await this.requireEnabledLogSource(logSourceId);
    const range = await this.resolveCollectionRange(source.id, body);
    const channel = await this.requireFetchableDiscordChannel(source);
    const stats = await this.fetchRange(source, channel, range, {
      persist: false,
    });

    return {
      logSourceId: source.id,
      mode: range.mode,
      resolvedStartAt: range.resolvedStartAt,
      resolvedEndAt: range.resolvedEndAt,
      totalMessages: stats.totalMessages,
      alreadyStoredMessages: stats.alreadyStoredMessages,
      newMessages: stats.newMessages,
      attachmentCount: stats.attachmentCount,
      firstMessageAt: stats.firstMessageAt,
      lastMessageAt: stats.lastMessageAt,
      existingChangedCandidateCount: stats.existingChangedCandidateCount,
      incrementalMessageLimit: range.incrementalMessageLimit ?? null,
      startCursorMessageId: range.startCursorMessageId ?? null,
      throughMessageId: range.throughMessageId ?? null,
      scannedThroughAt: range.scannedThroughAt ?? null,
      hasMore: stats.hasMore ?? false,
    };
  }

  async collectLogSource(
    logSourceId: string,
    body: DiscordCollectionBody,
    userId: string,
  ) {
    const source = await this.requireEnabledLogSource(logSourceId);
    const range = await this.resolveCollectionRange(source.id, body);
    const channel = await this.requireFetchableDiscordChannel(source);
    const run = await this.prisma.discordCollectionRun.create({
      data: {
        campaignId: source.campaignId,
        logSourceId: source.id,
        mode: range.mode,
        status: 'RUNNING',
        requestedStartAt: range.requestedStartAt,
        requestedEndAt: range.requestedEndAt,
        resolvedStartAt: range.resolvedStartAt,
        resolvedEndAt: range.resolvedEndAt,
        requestedByUserId: userId,
      },
    });

    try {
      const stats = await this.fetchRange(source, channel, range, {
        persist: true,
        runId: run.id,
      });
      await this.finishRun(run.id, 'SUCCEEDED', stats);
      await this.recordCollectionCoverage(source.id, range, 'COMPLETE');
      await this.advanceIncrementalCursorIfNeeded(source.id, range, stats);
      return this.getCollectionRun(run.id);
    } catch (error) {
      const current = await this.prisma.discordCollectionRun.findUnique({
        where: { id: run.id },
      });
      const savedCount =
        (current?.newCount ?? 0) +
        (current?.updatedCount ?? 0) +
        (current?.unchangedCount ?? 0);
      const status: DiscordCollectionStatus =
        savedCount > 0 ? 'PARTIAL' : 'FAILED';
      await this.prisma.discordCollectionRun.update({
        where: { id: run.id },
        data: {
          status,
          errorMessage: this.safeErrorMessage(error),
          finishedAt: new Date(),
        },
      });
      if (status === 'PARTIAL') {
        await this.recordCollectionCoverage(source.id, range, 'PARTIAL');
      }
      this.logger.warn(
        `Discord collection ${run.id} ${status}: ${this.safeErrorMessage(error)}`,
      );
      throw this.toCollectionException(error, status);
    }
  }

  async listCollectionRuns(
    logSourceId: string,
    query: DiscordCollectionRunListQuery,
  ) {
    await this.requireLogSource(logSourceId);
    const { page, pageSize, skip } = this.parsePage(query);
    const mode = this.optionalEnum(
      query.mode,
      DISCORD_COLLECTION_MODES,
      'mode',
    );
    const status = this.optionalEnum(
      query.status,
      DISCORD_COLLECTION_STATUSES,
      'status',
    );
    const where: Prisma.DiscordCollectionRunWhereInput = {
      logSourceId,
      ...(mode ? { mode } : {}),
      ...(status ? { status } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.discordCollectionRun.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip,
        take: pageSize,
        include: { requestedByUser: { select: { id: true, username: true } } },
      }),
      this.prisma.discordCollectionRun.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async getCollectionRun(runId: string) {
    const run = await this.prisma.discordCollectionRun.findUnique({
      where: { id: this.requireString(runId, 'runId') },
      include: {
        campaign: true,
        logSource: true,
        requestedByUser: { select: { id: true, username: true } },
      },
    });
    if (!run) throw new NotFoundException('collection run not found');
    return run;
  }

  private async fetchRange(
    source: {
      id: string;
      campaignId: string;
      guildId: string;
      channelId: string;
    },
    channel: any,
    range: ResolvedCollectionRange,
    options: { persist: false } | { persist: true; runId: string },
  ): Promise<PreviewStats> {
    if (range.mode === 'INCREMENTAL') {
      return this.fetchIncrementalRange(source, channel, range, options);
    }
    return this.fetchTimeRange(source, channel, range, options);
  }

  private async fetchTimeRange(
    source: {
      id: string;
      campaignId: string;
      guildId: string;
      channelId: string;
    },
    channel: any,
    range: ResolvedCollectionRange,
    options: { persist: false } | { persist: true; runId: string },
  ): Promise<PreviewStats> {
    const stats = this.emptyPreviewStats();
    let before = this.snowflakeBefore(range.resolvedEndAt);
    const seenCursors = new Set<string>();
    const syncedAt = new Date();

    while (true) {
      if (seenCursors.has(before)) {
        throw new ServiceUnavailableException(
          'Discord pagination cursor did not advance',
        );
      }
      seenCursors.add(before);

      const batch = await this.fetchMessagePage(channel, before);
      if (batch.length === 0) break;

      const nextBefore = this.smallestSnowflake(
        batch.map((message) => message.id),
      );
      const pageRecords = batch
        .map((message) => this.toMessageRecord(source, message))
        .filter((record) => this.isRecordInRange(record, range));

      if (pageRecords.length > 0) {
        const pageStats = options.persist
          ? await this.persistPage(pageRecords, syncedAt)
          : await this.previewPage(pageRecords);
        this.mergeStats(stats, pageStats);
      }

      if (options.persist) {
        await this.prisma.discordCollectionRun.update({
          where: { id: options.runId },
          data: {
            fetchedCount: stats.fetchedCount,
            newCount: stats.newCount,
            updatedCount: stats.updatedCount,
            unchangedCount: stats.unchangedCount,
            attachmentCount: stats.attachmentCount,
            firstMessageAt: stats.firstMessageAt,
            lastMessageAt: stats.lastMessageAt,
            lastCursorMessageId: nextBefore,
          },
        });
      }
      stats.lastCursorMessageId = nextBefore;

      const oldestTimestamp = Math.min(
        ...batch.map((message) => message.createdTimestamp),
      );
      if (
        oldestTimestamp < range.resolvedStartAt.getTime() ||
        batch.length < DISCORD_PAGE_LIMIT ||
        nextBefore === before
      ) {
        break;
      }
      before = nextBefore;
    }

    stats.totalMessages = stats.fetchedCount;
    return stats;
  }

  private async fetchIncrementalRange(
    source: {
      id: string;
      campaignId: string;
      guildId: string;
      channelId: string;
    },
    channel: any,
    range: ResolvedCollectionRange,
    options: { persist: false } | { persist: true; runId: string },
  ): Promise<PreviewStats> {
    const stats = this.emptyPreviewStats();
    const limit =
      range.incrementalMessageLimit ?? DEFAULT_INCREMENTAL_MESSAGE_LIMIT;
    const startCursor = range.startCursorMessageId;
    if (!startCursor) {
      throw new BadRequestException('incremental start cursor is required');
    }

    const targetRecords = range.hasFixedIncrementalBoundary
      ? await this.fetchFixedIncrementalRecords(source, channel, range)
      : await this.fetchNextIncrementalRecords(source, channel, range, limit);

    const syncedAt = new Date();
    for (const records of this.chunkRecords(
      targetRecords.records,
      DISCORD_PAGE_LIMIT,
    )) {
      const pageStats = options.persist
        ? await this.persistPage(records, syncedAt)
        : await this.previewPage(records);
      this.mergeStats(stats, pageStats);

      if (options.persist) {
        await this.prisma.discordCollectionRun.update({
          where: { id: options.runId },
          data: {
            fetchedCount: stats.fetchedCount,
            newCount: stats.newCount,
            updatedCount: stats.updatedCount,
            unchangedCount: stats.unchangedCount,
            attachmentCount: stats.attachmentCount,
            firstMessageAt: stats.firstMessageAt,
            lastMessageAt: stats.lastMessageAt,
            lastCursorMessageId: targetRecords.throughMessageId ?? startCursor,
          },
        });
      }
    }

    stats.lastCursorMessageId = targetRecords.throughMessageId ?? startCursor;
    stats.totalMessages = stats.fetchedCount;
    stats.hasMore = targetRecords.hasMore;
    range.throughMessageId = targetRecords.throughMessageId;
    range.scannedThroughAt = targetRecords.scannedThroughAt;
    range.resolvedEndAt = targetRecords.scannedThroughAt;
    return stats;
  }

  private async fetchNextIncrementalRecords(
    source: {
      id: string;
      guildId: string;
      channelId: string;
    },
    channel: any,
    range: ResolvedCollectionRange,
    limit: number,
  ) {
    const records: DiscordMessageRecord[] = [];
    let after = range.startCursorMessageId;
    const seenCursors = new Set<string>();

    while (after && records.length <= limit) {
      if (seenCursors.has(after)) {
        throw new ServiceUnavailableException(
          'Discord pagination cursor did not advance',
        );
      }
      seenCursors.add(after);

      const batch = await this.fetchMessagePageAfter(channel, after);
      if (batch.length === 0) break;

      const pageRecords = batch
        .map((message) => this.toMessageRecord(source, message))
        .sort((a, b) => this.compareRecordsChronologically(a, b));
      records.push(...pageRecords);
      after = pageRecords[pageRecords.length - 1]?.discordMessageId ?? after;
      if (batch.length < DISCORD_PAGE_LIMIT) break;
    }

    const selectedRecords = records.slice(0, limit);
    const hasMore = records.length > limit;
    const lastSelected = selectedRecords[selectedRecords.length - 1] ?? null;
    const scannedThroughAt = hasMore
      ? (lastSelected?.timestamp ?? new Date())
      : new Date();
    return {
      records: selectedRecords,
      throughMessageId: lastSelected?.discordMessageId ?? null,
      scannedThroughAt,
      hasMore,
    };
  }

  private async fetchFixedIncrementalRecords(
    source: {
      id: string;
      guildId: string;
      channelId: string;
    },
    channel: any,
    range: ResolvedCollectionRange,
  ) {
    const throughMessageId = range.throughMessageId ?? null;
    const scannedThroughAt = range.scannedThroughAt ?? new Date();
    if (!throughMessageId) {
      return {
        records: [],
        throughMessageId: null,
        scannedThroughAt,
        hasMore: false,
      };
    }

    const records: DiscordMessageRecord[] = [];
    let after = range.startCursorMessageId;
    const seenCursors = new Set<string>();
    let foundThroughMessage = false;

    while (after && !foundThroughMessage) {
      if (seenCursors.has(after)) {
        throw new ServiceUnavailableException(
          'Discord pagination cursor did not advance',
        );
      }
      seenCursors.add(after);

      const batch = await this.fetchMessagePageAfter(channel, after);
      if (batch.length === 0) break;

      const pageRecords = batch
        .map((message) => this.toMessageRecord(source, message))
        .sort((a, b) => this.compareRecordsChronologically(a, b));

      for (const record of pageRecords) {
        if (record.timestamp.getTime() > scannedThroughAt.getTime()) {
          continue;
        }
        records.push(record);
        if (record.discordMessageId === throughMessageId) {
          foundThroughMessage = true;
          break;
        }
      }

      after = pageRecords[pageRecords.length - 1]?.discordMessageId ?? after;
      if (batch.length < DISCORD_PAGE_LIMIT) break;
    }

    if (!foundThroughMessage) {
      throw new BadRequestException(
        'previewed incremental boundary message was not found',
      );
    }

    return {
      records,
      throughMessageId,
      scannedThroughAt,
      hasMore: false,
    };
  }

  private async previewPage(
    records: DiscordMessageRecord[],
  ): Promise<PreviewStats> {
    const existing = await this.findExistingMessages(records);
    const stats = this.emptyPreviewStats();
    for (const record of records) {
      const current = existing.get(record.discordMessageId);
      this.addFetchedStats(stats, record);
      if (!current) {
        stats.newCount += 1;
        stats.newMessages += 1;
        continue;
      }
      this.assertSameSource(current, record);
      stats.unchangedCount += 1;
      stats.alreadyStoredMessages += 1;
      if (this.hasMeaningfulChange(current, record)) {
        stats.existingChangedCandidateCount += 1;
      }
    }
    stats.totalMessages = stats.fetchedCount;
    return stats;
  }

  private async persistPage(
    records: DiscordMessageRecord[],
    syncedAt: Date,
  ): Promise<PreviewStats> {
    const existing = await this.findExistingMessages(records);
    const stats = this.emptyPreviewStats();

    await this.prisma.$transaction(async (tx) => {
      for (const record of records) {
        const current = existing.get(record.discordMessageId);
        this.addFetchedStats(stats, record);
        if (!current) {
          await tx.discordMessage.create({
            data: {
              ...this.messageCreateData(record, syncedAt),
              attachments: {
                create: record.attachments,
              },
            },
          });
          stats.newCount += 1;
          stats.newMessages += 1;
          continue;
        }

        this.assertSameSource(current, record);
        const changed = this.hasMeaningfulChange(current, record);
        await tx.discordMessage.update({
          where: { id: current.id },
          data: this.messageUpdateData(record, syncedAt),
        });
        if (changed) {
          await tx.discordMessageAttachment.deleteMany({
            where: { messageId: current.id },
          });
          if (record.attachments.length > 0) {
            await tx.discordMessageAttachment.createMany({
              data: record.attachments.map((attachment) => ({
                ...attachment,
                messageId: current.id,
              })),
            });
          }
          stats.updatedCount += 1;
        } else {
          stats.unchangedCount += 1;
          stats.alreadyStoredMessages += 1;
        }
      }
    });

    stats.totalMessages = stats.fetchedCount;
    return stats;
  }

  private messageCreateData(record: DiscordMessageRecord, syncedAt: Date) {
    return {
      discordMessageId: record.discordMessageId,
      logSourceId: record.logSourceId,
      guildId: record.guildId,
      channelId: record.channelId,
      authorDiscordUserId: record.authorDiscordUserId,
      authorDisplayName: record.authorDisplayName,
      content: record.content,
      timestamp: record.timestamp,
      isBot: record.isBot,
      webhookId: record.webhookId,
      replyToMessageId: record.replyToMessageId,
      discordEditedAt: record.discordEditedAt,
      lastSyncedAt: syncedAt,
      messageType: record.messageType,
      embedsJson: this.jsonOrDbNull(record.embedsJson),
    };
  }

  private messageUpdateData(
    record: DiscordMessageRecord,
    syncedAt: Date,
  ): Prisma.DiscordMessageUpdateInput {
    return {
      content: record.content,
      isBot: record.isBot,
      replyToMessageId: record.replyToMessageId,
      discordEditedAt: record.discordEditedAt,
      lastSyncedAt: syncedAt,
      messageType: record.messageType,
      embedsJson: this.jsonOrDbNull(record.embedsJson),
      isDeleted: false,
      deletedAt: null,
    };
  }

  private async findExistingMessages(
    records: DiscordMessageRecord[],
  ): Promise<Map<string, ExistingDiscordMessage>> {
    const ids = records.map((record) => record.discordMessageId);
    const existing = await this.prisma.discordMessage.findMany({
      where: { discordMessageId: { in: ids } },
      include: { attachments: true },
    });
    return new Map(
      existing.map((message) => [message.discordMessageId, message]),
    );
  }

  private hasMeaningfulChange(
    current: ExistingDiscordMessage,
    record: DiscordMessageRecord,
  ) {
    const comparable = {
      content: current.content,
      isBot: current.isBot,
      replyToMessageId: current.replyToMessageId,
      discordEditedAt: current.discordEditedAt?.toISOString() ?? null,
      messageType: current.messageType,
      embedsJson: this.stableJsonValue(current.embedsJson ?? null),
      attachments: this.normalizeAttachments(current.attachments),
    };
    const next = {
      content: record.content,
      isBot: record.isBot,
      replyToMessageId: record.replyToMessageId,
      discordEditedAt: record.discordEditedAt?.toISOString() ?? null,
      messageType: record.messageType,
      embedsJson: this.stableJsonValue(record.embedsJson),
      attachments: this.normalizeAttachments(record.attachments),
    };
    return JSON.stringify(comparable) !== JSON.stringify(next);
  }

  private assertSameSource(
    current: {
      discordMessageId: string;
      logSourceId: string;
      channelId: string;
    },
    record: DiscordMessageRecord,
  ) {
    if (current.logSourceId !== record.logSourceId) {
      throw new ConflictException(
        `discordMessageId ${record.discordMessageId} already belongs to another log source`,
      );
    }
    if (current.channelId !== record.channelId) {
      throw new ConflictException(
        `discordMessageId ${record.discordMessageId} has a conflicting channel`,
      );
    }
  }

  private normalizeAttachments(attachments: DiscordAttachmentRecord[]) {
    return [...attachments]
      .map((attachment) => ({
        discordAttachmentId: attachment.discordAttachmentId,
        filename: attachment.filename,
        url: this.normalizeAttachmentUrlForComparison(attachment.url),
        contentType: attachment.contentType,
        size: attachment.size,
      }))
      .sort((a, b) =>
        a.discordAttachmentId.localeCompare(b.discordAttachmentId),
      );
  }

  private normalizeAttachmentUrlForComparison(url: string) {
    return url.split('?')[0];
  }

  private stableJsonValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((entry) => this.stableJsonValue(entry));
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, entry]) => [key, this.stableJsonValue(entry)]),
      );
    }
    return value;
  }

  private toMessageRecord(
    source: {
      id: string;
      guildId: string;
      channelId: string;
    },
    message: Message,
  ): DiscordMessageRecord {
    const attachments = [...message.attachments.values()].map((attachment) => ({
      discordAttachmentId: attachment.id,
      filename: attachment.name ?? '',
      url: attachment.url,
      contentType: attachment.contentType ?? null,
      size: Number.isFinite(attachment.size) ? attachment.size : null,
    }));
    const embeds = message.embeds
      .map((embed) => embed.toJSON())
      .filter((embed) => Object.keys(embed).length > 0);
    const messageType = Number(message.type);
    return {
      discordMessageId: message.id,
      logSourceId: source.id,
      guildId: message.guildId ?? source.guildId,
      channelId: message.channelId ?? source.channelId,
      authorDiscordUserId: message.webhookId
        ? null
        : (message.author?.id ?? null),
      authorDisplayName: this.resolveAuthorDisplayName(message),
      content: message.content ?? '',
      timestamp: new Date(message.createdTimestamp),
      isBot: Boolean(message.author?.bot),
      webhookId: message.webhookId ?? null,
      replyToMessageId: message.reference?.messageId ?? null,
      discordEditedAt: message.editedTimestamp
        ? new Date(message.editedTimestamp)
        : null,
      messageType: Number.isFinite(messageType) ? messageType : null,
      embedsJson: embeds.length
        ? (embeds as unknown as Prisma.InputJsonValue)
        : null,
      attachments,
    };
  }

  private resolveAuthorDisplayName(message: Message) {
    if (message.webhookId) {
      return message.author?.username ?? 'Unknown webhook';
    }
    return (
      message.member?.displayName ??
      message.author?.globalName ??
      message.author?.username ??
      'Unknown user'
    );
  }

  private isRecordInRange(
    record: DiscordMessageRecord,
    range: ResolvedCollectionRange,
  ) {
    const timestamp = record.timestamp.getTime();
    if (
      timestamp < range.resolvedStartAt.getTime() ||
      timestamp >= range.resolvedEndAt.getTime()
    ) {
      return false;
    }
    if (!range.exclusiveAfterMessageId || !range.exclusiveAfterTimestamp) {
      return true;
    }
    const startTimestamp = range.exclusiveAfterTimestamp.getTime();
    if (timestamp > startTimestamp) return true;
    if (timestamp < startTimestamp) return false;
    return (
      this.compareSnowflake(
        record.discordMessageId,
        range.exclusiveAfterMessageId,
      ) > 0
    );
  }

  private async fetchMessagePage(
    channel: any,
    before: string,
  ): Promise<Message[]> {
    try {
      const batch = await channel.messages.fetch({
        limit: DISCORD_PAGE_LIMIT,
        before,
      });
      return [...batch.values()] as Message[];
    } catch (error) {
      throw this.toDiscordFetchException(error);
    }
  }

  private async fetchMessagePageAfter(
    channel: any,
    after: string,
  ): Promise<Message[]> {
    try {
      const batch = await channel.messages.fetch({
        limit: DISCORD_PAGE_LIMIT,
        after,
      });
      return [...batch.values()] as Message[];
    } catch (error) {
      throw this.toDiscordFetchException(error);
    }
  }

  private async requireFetchableDiscordChannel(source: {
    guildId: string;
    channelId: string;
  }) {
    if (!this.client || !this.client.isReady?.()) {
      throw new ServiceUnavailableException('Discord client is not ready');
    }

    let channel: any;
    try {
      channel = await this.client.channels.fetch(source.channelId);
    } catch (error) {
      throw this.toDiscordFetchException(error);
    }
    if (!channel) throw new NotFoundException('Discord channel not found');
    const guildId = channel.guildId ?? channel.guild?.id ?? null;
    if (guildId !== source.guildId) {
      throw new BadRequestException(
        'Discord channel guild does not match log source',
      );
    }
    if (!channel.messages?.fetch) {
      throw new BadRequestException(
        'Discord channel does not support message fetch',
      );
    }

    const guild = channel.guild ?? null;
    const me = guild?.members?.fetchMe
      ? await guild.members.fetchMe().catch(() => null)
      : null;
    const permissions = channel.permissionsFor?.(
      me ?? this.client.user ?? null,
    );
    if (permissions) {
      if (!permissions.has(PermissionFlagsBits.ViewChannel)) {
        throw new ForbiddenException('Discord ViewChannel permission required');
      }
      if (!permissions.has(PermissionFlagsBits.ReadMessageHistory)) {
        throw new ForbiddenException(
          'Discord ReadMessageHistory permission required',
        );
      }
    }
    return channel;
  }

  private async resolveCollectionRange(
    logSourceId: string,
    body: DiscordCollectionBody,
  ): Promise<ResolvedCollectionRange> {
    const mode = this.requireEnum(body.mode, DISCORD_COLLECTION_MODES, 'mode');
    if (mode === 'RANGE') {
      if (
        body.incrementalMessageLimit !== undefined ||
        body.startCursorMessageId !== undefined ||
        body.throughMessageId !== undefined ||
        body.scannedThroughAt !== undefined
      ) {
        throw new BadRequestException(
          'RANGE collection does not accept incremental fields',
        );
      }
      const startAt = this.parseDate(body.startAt, 'startAt');
      const endAt = this.parseDate(body.endAt, 'endAt');
      this.validateDateRange(startAt, endAt, 'startAt', 'endAt', false);
      return {
        mode,
        requestedStartAt: startAt,
        requestedEndAt: endAt,
        resolvedStartAt: startAt,
        resolvedEndAt: endAt,
      };
    }

    if (body.startAt !== undefined || body.endAt !== undefined) {
      throw new BadRequestException(
        'INCREMENTAL collection does not accept startAt or endAt',
      );
    }
    const limit = this.parseIncrementalMessageLimit(
      body.incrementalMessageLimit,
    );
    const source = await this.prisma.discordLogSource.findUnique({
      where: { id: logSourceId },
      select: {
        incrementalCursorMessageId: true,
        incrementalScannedThroughAt: true,
      },
    });
    if (!source) throw new NotFoundException('log source not found');

    const fixedStartCursor = this.optionalString(
      body.startCursorMessageId,
      'startCursorMessageId',
    );
    const fixedThroughMessageId = this.optionalString(
      body.throughMessageId,
      'throughMessageId',
    );
    const fixedScannedThroughAt = this.optionalDate(
      body.scannedThroughAt,
      'scannedThroughAt',
    );

    if (
      (fixedStartCursor || fixedThroughMessageId || fixedScannedThroughAt) &&
      (!fixedStartCursor || !fixedScannedThroughAt)
    ) {
      throw new BadRequestException(
        'fixed incremental collection requires startCursorMessageId and scannedThroughAt',
      );
    }
    if (fixedStartCursor) {
      const cursor = await this.requireStoredCursorMessage(
        logSourceId,
        fixedStartCursor,
      );
      this.validateDateRange(
        cursor.timestamp,
        fixedScannedThroughAt,
        'startCursorMessageId',
        'scannedThroughAt',
        true,
      );
      return {
        mode,
        requestedStartAt: null,
        requestedEndAt: null,
        resolvedStartAt: cursor.timestamp,
        resolvedEndAt: fixedScannedThroughAt ?? new Date(),
        exclusiveAfterMessageId: cursor.discordMessageId,
        exclusiveAfterTimestamp: cursor.timestamp,
        incrementalMessageLimit: limit,
        startCursorMessageId: cursor.discordMessageId,
        throughMessageId: fixedThroughMessageId,
        scannedThroughAt: fixedScannedThroughAt,
        hasFixedIncrementalBoundary: true,
      };
    }

    const cursor = source.incrementalCursorMessageId
      ? await this.requireStoredCursorMessage(
          logSourceId,
          source.incrementalCursorMessageId,
        )
      : await this.findBootstrapCursorMessage(logSourceId);
    const now = new Date();
    this.validateDateRange(cursor.timestamp, now, 'cursor', 'now', true);
    return {
      mode,
      requestedStartAt: null,
      requestedEndAt: null,
      resolvedStartAt: cursor.timestamp,
      resolvedEndAt: now,
      exclusiveAfterMessageId: cursor.discordMessageId,
      exclusiveAfterTimestamp: cursor.timestamp,
      incrementalMessageLimit: limit,
      startCursorMessageId: cursor.discordMessageId,
      throughMessageId: null,
      scannedThroughAt: now,
      hasFixedIncrementalBoundary: false,
    };
  }

  private async requireEnabledLogSource(logSourceId: string) {
    const source = await this.requireLogSource(logSourceId);
    if (!source.enabled)
      throw new BadRequestException('log source is disabled');
    if (!source.guildId || !source.channelId) {
      throw new BadRequestException(
        'log source guild/channel is not configured',
      );
    }
    return source;
  }

  private async requireLogSource(logSourceId: string) {
    const source = await this.prisma.discordLogSource.findUnique({
      where: { id: this.requireString(logSourceId, 'logSourceId') },
    });
    if (!source) throw new NotFoundException('log source not found');
    return source;
  }

  private async requireStoredCursorMessage(
    logSourceId: string,
    discordMessageId: string,
  ) {
    const cursor = await this.prisma.discordMessage.findFirst({
      where: { logSourceId, discordMessageId },
      select: { discordMessageId: true, timestamp: true },
    });
    if (!cursor) {
      throw new BadRequestException('incremental cursor message was not found');
    }
    return cursor;
  }

  private async findBootstrapCursorMessage(logSourceId: string) {
    const latest = await this.prisma.discordMessage.findFirst({
      where: { logSourceId },
      orderBy: [{ timestamp: 'desc' }, { discordMessageId: 'desc' }],
      select: { discordMessageId: true, timestamp: true },
    });
    if (!latest) {
      throw new BadRequestException(
        '아직 저장된 메시지가 없습니다. 최초 수집은 기간을 지정하여 실행하세요.',
      );
    }
    return latest;
  }

  private async advanceIncrementalCursorIfNeeded(
    logSourceId: string,
    range: ResolvedCollectionRange,
    stats: CollectionStats,
  ) {
    if (range.mode !== 'INCREMENTAL') return;
    const cursorMessageId =
      range.throughMessageId ??
      stats.lastCursorMessageId ??
      range.startCursorMessageId ??
      null;
    if (!cursorMessageId) return;
    await this.prisma.discordLogSource.update({
      where: { id: logSourceId },
      data: {
        incrementalCursorMessageId: cursorMessageId,
        incrementalScannedThroughAt:
          range.scannedThroughAt ?? stats.lastMessageAt ?? range.resolvedEndAt,
      },
    });
  }

  private async finishRun(
    runId: string,
    status: DiscordCollectionStatus,
    stats: CollectionStats,
  ) {
    await this.prisma.discordCollectionRun.update({
      where: { id: runId },
      data: {
        status,
        fetchedCount: stats.fetchedCount,
        newCount: stats.newCount,
        updatedCount: stats.updatedCount,
        unchangedCount: stats.unchangedCount,
        attachmentCount: stats.attachmentCount,
        firstMessageAt: stats.firstMessageAt,
        lastMessageAt: stats.lastMessageAt,
        lastCursorMessageId: stats.lastCursorMessageId,
        finishedAt: new Date(),
        errorMessage: null,
      },
    });
  }

  private async recordCollectionCoverage(
    logSourceId: string,
    range: ResolvedCollectionRange,
    status: Extract<CollectionCoverageStatus, 'COMPLETE' | 'PARTIAL'>,
  ) {
    const existing = await this.prisma.logSourceCoverage.findFirst({
      where: {
        logSourceId,
        startAt: range.resolvedStartAt,
        endAt: range.resolvedEndAt,
      },
    });
    if (existing) {
      if (existing.collectionStatus === 'COMPLETE' && status === 'PARTIAL') {
        return;
      }
      await this.prisma.logSourceCoverage.update({
        where: { id: existing.id },
        data: { collectionStatus: status },
      });
      return;
    }
    await this.prisma.logSourceCoverage.create({
      data: {
        logSourceId,
        startAt: range.resolvedStartAt,
        endAt: range.resolvedEndAt,
        collectionStatus: status,
        archiveConfidenceStatus: 'UNKNOWN',
      },
    });
  }

  private addFetchedStats(
    stats: CollectionStats,
    record: DiscordMessageRecord,
  ) {
    stats.fetchedCount += 1;
    stats.attachmentCount += record.attachments.length;
    if (!stats.firstMessageAt || record.timestamp < stats.firstMessageAt) {
      stats.firstMessageAt = record.timestamp;
    }
    if (!stats.lastMessageAt || record.timestamp > stats.lastMessageAt) {
      stats.lastMessageAt = record.timestamp;
    }
  }

  private mergeStats(stats: PreviewStats, next: PreviewStats) {
    stats.fetchedCount += next.fetchedCount;
    stats.newCount += next.newCount;
    stats.updatedCount += next.updatedCount;
    stats.unchangedCount += next.unchangedCount;
    stats.attachmentCount += next.attachmentCount;
    stats.totalMessages += next.totalMessages;
    stats.alreadyStoredMessages += next.alreadyStoredMessages;
    stats.newMessages += next.newMessages;
    stats.existingChangedCandidateCount += next.existingChangedCandidateCount;
    if (
      next.firstMessageAt &&
      (!stats.firstMessageAt || next.firstMessageAt < stats.firstMessageAt)
    ) {
      stats.firstMessageAt = next.firstMessageAt;
    }
    if (
      next.lastMessageAt &&
      (!stats.lastMessageAt || next.lastMessageAt > stats.lastMessageAt)
    ) {
      stats.lastMessageAt = next.lastMessageAt;
    }
    if (next.lastCursorMessageId)
      stats.lastCursorMessageId = next.lastCursorMessageId;
  }

  private emptyPreviewStats(): PreviewStats {
    return {
      fetchedCount: 0,
      newCount: 0,
      updatedCount: 0,
      unchangedCount: 0,
      attachmentCount: 0,
      firstMessageAt: null,
      lastMessageAt: null,
      lastCursorMessageId: null,
      totalMessages: 0,
      alreadyStoredMessages: 0,
      newMessages: 0,
      existingChangedCandidateCount: 0,
    };
  }

  private snowflakeBefore(date: Date) {
    return SnowflakeUtil.generate({
      timestamp: date,
      increment: 0n,
    }).toString();
  }

  private smallestSnowflake(ids: string[]) {
    return ids.reduce((smallest, id) =>
      this.compareSnowflake(id, smallest) < 0 ? id : smallest,
    );
  }

  private compareSnowflake(a: string, b: string) {
    const left = BigInt(a);
    const right = BigInt(b);
    if (left === right) return 0;
    return left > right ? 1 : -1;
  }

  private compareRecordsChronologically(
    a: DiscordMessageRecord,
    b: DiscordMessageRecord,
  ) {
    const timeDiff = a.timestamp.getTime() - b.timestamp.getTime();
    if (timeDiff !== 0) return timeDiff;
    return this.compareSnowflake(a.discordMessageId, b.discordMessageId);
  }

  private chunkRecords<T>(records: T[], size: number) {
    const chunks: T[][] = [];
    for (let index = 0; index < records.length; index += size) {
      chunks.push(records.slice(index, index + size));
    }
    return chunks;
  }

  private jsonOrDbNull(value: Prisma.InputJsonValue | null) {
    return value === null ? Prisma.DbNull : value;
  }

  private parseDate(raw: unknown, field: string): Date {
    const value = this.requireString(raw, field);
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${field} must be a valid date`);
    }
    return date;
  }

  private parseIncrementalMessageLimit(raw: unknown): number {
    if (raw === undefined || raw === null || raw === '') {
      return DEFAULT_INCREMENTAL_MESSAGE_LIMIT;
    }
    const value = Number(raw);
    if (
      !Number.isInteger(value) ||
      value <= 0 ||
      value > MAX_INCREMENTAL_MESSAGE_LIMIT
    ) {
      throw new BadRequestException(
        `incrementalMessageLimit must be an integer between 1 and ${MAX_INCREMENTAL_MESSAGE_LIMIT}`,
      );
    }
    return value;
  }

  private optionalString(raw: unknown, field: string): string | null {
    if (raw === undefined || raw === null || raw === '') return null;
    const value = String(raw).trim();
    if (!value) throw new BadRequestException(`${field} is invalid`);
    return value;
  }

  private optionalDate(raw: unknown, field: string): Date | null {
    if (raw === undefined || raw === null || raw === '') return null;
    const date = new Date(String(raw));
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${field} must be a valid date`);
    }
    return date;
  }

  private validateDateRange(
    startAt: Date | null,
    endAt: Date | null,
    startName: string,
    endName: string,
    allowEqual: boolean,
  ) {
    if (!startAt || !endAt) return;
    const ok = allowEqual
      ? startAt.getTime() <= endAt.getTime()
      : startAt.getTime() < endAt.getTime();
    if (!ok) {
      throw new BadRequestException(`${startName} must be before ${endName}`);
    }
  }

  private parsePage(query: { page?: string; pageSize?: string }) {
    const page = Math.max(0, Math.trunc(Number(query.page ?? 0)));
    const rawPageSize = Math.trunc(Number(query.pageSize ?? 20));
    const pageSize =
      Number.isFinite(rawPageSize) && rawPageSize > 0
        ? Math.min(rawPageSize, 100)
        : 20;
    return { page, pageSize, skip: page * pageSize };
  }

  private requireString(raw: unknown, field: string): string {
    const value = String(raw ?? '').trim();
    if (!value) throw new BadRequestException(`${field} required`);
    return value;
  }

  private requireEnum<T extends string>(
    raw: unknown,
    values: readonly T[],
    field: string,
  ): T {
    const value = this.requireString(raw, field) as T;
    if (!values.includes(value)) {
      throw new BadRequestException(`${field} is invalid`);
    }
    return value;
  }

  private optionalEnum<T extends string>(
    raw: unknown,
    values: readonly T[],
    field: string,
  ): T | undefined {
    if (raw === undefined) return undefined;
    return this.requireEnum(raw, values, field);
  }

  private toDiscordFetchException(error: unknown) {
    const message = this.safeErrorMessage(error);
    if (
      message.includes('Missing Access') ||
      message.includes('Missing Permissions')
    ) {
      return new ForbiddenException(
        `Discord channel permission is missing: ${message}`,
      );
    }
    if (message.includes('Unknown Channel')) {
      return new NotFoundException('Discord channel not found');
    }
    return new ServiceUnavailableException(`Discord fetch failed: ${message}`);
  }

  private toCollectionException(
    error: unknown,
    status: DiscordCollectionStatus,
  ) {
    if (
      error instanceof BadRequestException ||
      error instanceof NotFoundException ||
      error instanceof ForbiddenException ||
      error instanceof ConflictException ||
      error instanceof ServiceUnavailableException
    ) {
      return error;
    }
    return new ServiceUnavailableException(
      `Discord collection ${status.toLowerCase()}: ${this.safeErrorMessage(error)}`,
    );
  }

  private safeErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message;
    return String(error ?? 'unknown error');
  }
}
