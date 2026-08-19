import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActorRuleResultType,
  AffinityValueType,
  ArchiveConfidenceStatus,
  CampaignParticipantRole,
  CollectionCoverageStatus,
  DiscordLogSourceType,
  PersonType,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import {
  ACTOR_RULE_RESULT_TYPES,
  ActorRuleListQuery,
  AFFINITY_VALUE_TYPES,
  ARCHIVE_CONFIDENCE_STATUSES,
  CAMPAIGN_PARTICIPANT_ROLES,
  COLLECTION_COVERAGE_STATUSES,
  CreateActorRuleBody,
  CreateCampaignBody,
  CreateCampaignParticipantBody,
  CreateDiscordLogSourceBody,
  CreateLogSourceCoverageBody,
  CreatePersonAliasBody,
  CreatePersonBody,
  CreateStoryTimeAnchorBody,
  DISCORD_LOG_SOURCE_TYPES,
  LogSourceCoverageListQuery,
  PERSON_TYPES,
  PersonListQuery,
  StoryTimeAnchorListQuery,
  UpdateActorRuleBody,
  UpdateAffinityBody,
  UpdateCampaignBody,
  UpdateCampaignParticipantBody,
  UpdateDiscordLogSourceBody,
  UpdateLogSourceCoverageBody,
  UpdatePersonAliasBody,
  UpdatePersonBody,
  UpdateStoryTimeAnchorBody,
  UpsertAffinityBody,
} from './session-archive.dto';

type PageInput = {
  page?: string;
  pageSize?: string;
};

type StoryTimeAnchorCreateData = Prisma.StoryTimeAnchorUncheckedCreateInput & {
  logSourceId: string;
  sourceStartAt: Date;
  sourceEndAt: Date;
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

@Injectable()
export class SessionArchiveService {
  constructor(private readonly prisma: PrismaClient) {}

  private normalizeText(raw: unknown): string {
    return String(raw ?? '')
      .trim()
      .toLowerCase();
  }

  private trimString(raw: unknown): string {
    return String(raw ?? '').trim();
  }

  private optionalString(raw: unknown): string | null {
    if (raw === undefined || raw === null) return null;
    const value = this.trimString(raw);
    return value ? value : null;
  }

  private requireString(raw: unknown, field: string): string {
    const value = this.trimString(raw);
    if (!value) throw new BadRequestException(`${field} required`);
    return value;
  }

  private optionalBoolean(raw: unknown): boolean | undefined {
    if (raw === undefined) return undefined;
    if (typeof raw === 'boolean') return raw;
    if (typeof raw === 'string') {
      const value = raw.trim().toLowerCase();
      if (['true', '1', 'yes', 'on'].includes(value)) return true;
      if (['false', '0', 'no', 'off'].includes(value)) return false;
    }
    throw new BadRequestException('boolean value required');
  }

  private optionalInteger(
    raw: unknown,
    field: string,
  ): number | null | undefined {
    if (raw === undefined) return undefined;
    if (raw === null || this.trimString(raw) === '') return null;
    const value = Number(raw);
    if (!Number.isInteger(value)) {
      throw new BadRequestException(`${field} must be an integer`);
    }
    return value;
  }

  private parsePage(query: PageInput) {
    const page = Math.max(0, Math.trunc(Number(query.page ?? 0)));
    const rawPageSize = Math.trunc(Number(query.pageSize ?? DEFAULT_PAGE_SIZE));
    const pageSize =
      Number.isFinite(rawPageSize) && rawPageSize > 0
        ? Math.min(rawPageSize, MAX_PAGE_SIZE)
        : DEFAULT_PAGE_SIZE;
    return { page, pageSize, skip: page * pageSize };
  }

  private parseDate(raw: unknown, field: string): Date {
    const value = this.requireString(raw, field);
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${field} must be a valid date`);
    }
    return date;
  }

  private optionalDate(raw: unknown, field: string): Date | null | undefined {
    if (raw === undefined) return undefined;
    if (raw === null || this.trimString(raw) === '') return null;
    return this.parseDate(raw, field);
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

  private mapPrismaError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new ConflictException('unique constraint violation');
      }
      if (error.code === 'P2003') {
        throw new BadRequestException('invalid referenced entity');
      }
      if (error.code === 'P2025') {
        throw new NotFoundException('target not found');
      }
    }
    throw error;
  }

  async listCampaigns() {
    return this.prisma.campaign.findMany({
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  async getCampaign(campaignId: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        _count: {
          select: {
            persons: true,
            participants: true,
            logSources: true,
            actorRules: true,
          },
        },
      },
    });
    if (!campaign) throw new NotFoundException('campaign not found');
    return campaign;
  }

  async createCampaign(body: CreateCampaignBody) {
    const name = this.requireString(body.name, 'name');
    try {
      return await this.prisma.campaign.create({ data: { name } });
    } catch (e) {
      this.mapPrismaError(e);
    }
  }

  async updateCampaign(campaignId: string, body: UpdateCampaignBody) {
    const data: Prisma.CampaignUpdateInput = {};
    if (body.name !== undefined)
      data.name = this.requireString(body.name, 'name');
    const isActive = this.optionalBoolean(body.isActive);
    if (isActive !== undefined) data.isActive = isActive;
    try {
      return await this.prisma.campaign.update({
        where: { id: campaignId },
        data,
      });
    } catch (e) {
      this.mapPrismaError(e);
    }
  }

  async deactivateCampaign(campaignId: string) {
    return this.updateCampaign(campaignId, { isActive: false });
  }

  async listPersons(campaignId: string, query: PersonListQuery) {
    await this.requireCampaign(campaignId);
    const { page, pageSize, skip } = this.parsePage(query);
    const search = this.trimString(query.search);
    const type = this.optionalEnum(query.type, PERSON_TYPES, 'type');
    const active =
      query.active === undefined
        ? undefined
        : this.optionalBoolean(query.active);
    const where: Prisma.PersonWhereInput = {
      campaignId,
      ...(type ? { type } : {}),
      ...(active !== undefined ? { isActive: active } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { title: { contains: search, mode: 'insensitive' } },
              {
                aliases: {
                  some: { alias: { contains: search, mode: 'insensitive' } },
                },
              },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.person.findMany({
        where,
        orderBy: [{ isActive: 'desc' }, { type: 'asc' }, { name: 'asc' }],
        skip,
        take: pageSize,
        include: { _count: { select: { aliases: true } } },
      }),
      this.prisma.person.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async getPerson(personId: string) {
    const person = await this.prisma.person.findUnique({
      where: { id: personId },
      include: {
        aliases: { orderBy: { alias: 'asc' } },
        campaignParticipants: true,
        defaultLogSources: true,
      },
    });
    if (!person) throw new NotFoundException('person not found');
    return person;
  }

  async createPerson(campaignId: string, body: CreatePersonBody) {
    await this.requireCampaign(campaignId);
    const data = {
      campaignId,
      name: this.requireString(body.name, 'name'),
      type: this.requireEnum(body.type, PERSON_TYPES, 'type'),
      title: this.optionalString(body.title),
      shortDescription: this.optionalString(body.shortDescription),
      isActive: this.optionalBoolean(body.isActive) ?? true,
    };
    try {
      return await this.prisma.person.create({ data });
    } catch (e) {
      this.mapPrismaError(e);
    }
  }

  async updatePerson(personId: string, body: UpdatePersonBody) {
    await this.requirePerson(personId);
    const data: Prisma.PersonUpdateInput = {};
    if (body.name !== undefined)
      data.name = this.requireString(body.name, 'name');
    const type = this.optionalEnum(body.type, PERSON_TYPES, 'type');
    if (type) data.type = type;
    if (body.title !== undefined) data.title = this.optionalString(body.title);
    if (body.shortDescription !== undefined) {
      data.shortDescription = this.optionalString(body.shortDescription);
    }
    const isActive = this.optionalBoolean(body.isActive);
    if (isActive !== undefined) data.isActive = isActive;
    try {
      return await this.prisma.person.update({ where: { id: personId }, data });
    } catch (e) {
      this.mapPrismaError(e);
    }
  }

  async deactivatePerson(personId: string) {
    return this.updatePerson(personId, { isActive: false });
  }

  async listPersonAliases(personId: string) {
    await this.requirePerson(personId);
    return this.prisma.personAlias.findMany({
      where: { personId },
      orderBy: [{ logSourceId: 'asc' }, { alias: 'asc' }],
      include: { logSource: true },
    });
  }

  async createPersonAlias(personId: string, body: CreatePersonAliasBody) {
    const person = await this.requirePerson(personId);
    const alias = this.requireString(body.alias, 'alias');
    const logSourceId = this.optionalString(body.logSourceId);
    if (logSourceId) {
      await this.requireLogSourceInCampaign(logSourceId, person.campaignId);
    }
    await this.ensureAliasScopeAvailable(
      person.campaignId,
      this.normalizeText(alias),
      logSourceId,
    );
    try {
      return await this.prisma.personAlias.create({
        data: {
          personId,
          alias,
          normalizedAlias: this.normalizeText(alias),
          logSourceId,
        },
      });
    } catch (e) {
      this.mapPrismaError(e);
    }
  }

  async updatePersonAlias(aliasId: string, body: UpdatePersonAliasBody) {
    const current = await this.requireAlias(aliasId);
    const person = await this.requirePerson(current.personId);
    const alias =
      body.alias === undefined
        ? current.alias
        : this.requireString(body.alias, 'alias');
    const normalizedAlias = this.normalizeText(alias);
    const logSourceId =
      body.logSourceId === undefined
        ? current.logSourceId
        : this.optionalString(body.logSourceId);
    if (logSourceId) {
      await this.requireLogSourceInCampaign(logSourceId, person.campaignId);
    }
    await this.ensureAliasScopeAvailable(
      person.campaignId,
      normalizedAlias,
      logSourceId,
      aliasId,
    );
    try {
      return await this.prisma.personAlias.update({
        where: { id: aliasId },
        data: { alias, normalizedAlias, logSourceId },
      });
    } catch (e) {
      this.mapPrismaError(e);
    }
  }

  async deletePersonAlias(aliasId: string) {
    try {
      await this.prisma.personAlias.delete({ where: { id: aliasId } });
      return { ok: true };
    } catch (e) {
      this.mapPrismaError(e);
    }
  }

  async listAffinities(sourcePersonId: string) {
    await this.requirePerson(sourcePersonId);
    return this.prisma.affinity.findMany({
      where: { sourcePersonId },
      orderBy: { updatedAt: 'desc' },
      include: { targetPerson: true },
    });
  }

  async upsertAffinity(body: UpsertAffinityBody) {
    const sourcePersonId = this.requireString(
      body.sourcePersonId,
      'sourcePersonId',
    );
    const targetPersonId = this.requireString(
      body.targetPersonId,
      'targetPersonId',
    );
    const valueType = this.requireEnum(
      body.valueType,
      AFFINITY_VALUE_TYPES,
      'valueType',
    );
    const data = await this.buildAffinityData(
      sourcePersonId,
      targetPersonId,
      valueType,
      body,
    );
    try {
      return await this.prisma.affinity.upsert({
        where: {
          sourcePersonId_targetPersonId: { sourcePersonId, targetPersonId },
        },
        create: data,
        update: {
          valueType: data.valueType,
          numericValue: data.numericValue,
          textValue: data.textValue,
          comment: data.comment,
        },
      });
    } catch (e) {
      this.mapPrismaError(e);
    }
  }

  async updateAffinity(affinityId: string, body: UpdateAffinityBody) {
    const current = await this.requireAffinity(affinityId);
    const valueType =
      this.optionalEnum(body.valueType, AFFINITY_VALUE_TYPES, 'valueType') ??
      current.valueType;
    const data = await this.buildAffinityData(
      current.sourcePersonId,
      current.targetPersonId,
      valueType,
      {
        numericValue:
          body.numericValue === undefined
            ? current.numericValue
            : body.numericValue,
        textValue:
          body.textValue === undefined ? current.textValue : body.textValue,
        comment: body.comment === undefined ? current.comment : body.comment,
      },
    );
    return this.prisma.affinity.update({
      where: { id: affinityId },
      data: {
        valueType: data.valueType,
        numericValue: data.numericValue,
        textValue: data.textValue,
        comment: data.comment,
      },
    });
  }

  async deleteAffinity(affinityId: string) {
    try {
      await this.prisma.affinity.delete({ where: { id: affinityId } });
      return { ok: true };
    } catch (e) {
      this.mapPrismaError(e);
    }
  }

  async listCampaignParticipants(campaignId: string) {
    await this.requireCampaign(campaignId);
    return this.prisma.campaignParticipant.findMany({
      where: { campaignId },
      orderBy: [{ role: 'asc' }, { discordDisplayName: 'asc' }],
      include: {
        linkedPerson: true,
        webUser: { select: { id: true, username: true } },
      },
    });
  }

  async createCampaignParticipant(
    campaignId: string,
    body: CreateCampaignParticipantBody,
  ) {
    await this.requireCampaign(campaignId);
    const linkedPersonId = this.optionalString(body.linkedPersonId);
    if (linkedPersonId) {
      await this.requirePcInCampaign(
        linkedPersonId,
        campaignId,
        'linkedPersonId',
      );
    }
    const webUserId = this.optionalString(body.webUserId);
    if (webUserId) await this.requireWebUser(webUserId);
    try {
      return await this.prisma.campaignParticipant.create({
        data: {
          campaignId,
          discordUserId: this.requireString(
            body.discordUserId,
            'discordUserId',
          ),
          discordDisplayName: this.optionalString(body.discordDisplayName),
          role: this.requireEnum(body.role, CAMPAIGN_PARTICIPANT_ROLES, 'role'),
          linkedPersonId,
          webUserId,
        },
      });
    } catch (e) {
      this.mapPrismaError(e);
    }
  }

  async updateCampaignParticipant(
    participantId: string,
    body: UpdateCampaignParticipantBody,
  ) {
    const current = await this.requireParticipant(participantId);
    const data: Prisma.CampaignParticipantUpdateInput = {};
    if (body.discordUserId !== undefined) {
      data.discordUserId = this.requireString(
        body.discordUserId,
        'discordUserId',
      );
    }
    if (body.discordDisplayName !== undefined) {
      data.discordDisplayName = this.optionalString(body.discordDisplayName);
    }
    const role = this.optionalEnum(
      body.role,
      CAMPAIGN_PARTICIPANT_ROLES,
      'role',
    );
    if (role) data.role = role;
    if (body.linkedPersonId !== undefined) {
      const linkedPersonId = this.optionalString(body.linkedPersonId);
      if (linkedPersonId) {
        await this.requirePcInCampaign(
          linkedPersonId,
          current.campaignId,
          'linkedPersonId',
        );
      }
      data.linkedPerson = linkedPersonId
        ? { connect: { id: linkedPersonId } }
        : { disconnect: true };
    }
    if (body.webUserId !== undefined) {
      const webUserId = this.optionalString(body.webUserId);
      if (webUserId) await this.requireWebUser(webUserId);
      data.webUser = webUserId
        ? { connect: { id: webUserId } }
        : { disconnect: true };
    }
    try {
      return await this.prisma.campaignParticipant.update({
        where: { id: participantId },
        data,
      });
    } catch (e) {
      this.mapPrismaError(e);
    }
  }

  async deleteCampaignParticipant(participantId: string) {
    try {
      await this.prisma.campaignParticipant.delete({
        where: { id: participantId },
      });
      return { ok: true };
    } catch (e) {
      this.mapPrismaError(e);
    }
  }

  async listLogSources(campaignId: string) {
    await this.requireCampaign(campaignId);
    return this.prisma.discordLogSource.findMany({
      where: { campaignId },
      orderBy: [{ enabled: 'desc' }, { displayName: 'asc' }],
      include: { defaultPc: true },
    });
  }

  async getLogSource(logSourceId: string) {
    const source = await this.prisma.discordLogSource.findUnique({
      where: { id: logSourceId },
      include: {
        defaultPc: true,
        coverages: { orderBy: { startAt: 'desc' } },
        _count: { select: { messages: true, actorRules: true, aliases: true } },
      },
    });
    if (!source) throw new NotFoundException('log source not found');
    return source;
  }

  async createLogSource(campaignId: string, body: CreateDiscordLogSourceBody) {
    await this.requireCampaign(campaignId);
    const data = await this.buildLogSourceData(campaignId, body, true);
    try {
      return await this.prisma.discordLogSource.create({ data });
    } catch (e) {
      this.mapPrismaError(e);
    }
  }

  async updateLogSource(logSourceId: string, body: UpdateDiscordLogSourceBody) {
    const current = await this.requireLogSource(logSourceId);
    const data = await this.buildLogSourceUpdateData(current, body);
    try {
      return await this.prisma.discordLogSource.update({
        where: { id: logSourceId },
        data,
      });
    } catch (e) {
      this.mapPrismaError(e);
    }
  }

  async disableLogSource(logSourceId: string) {
    return this.updateLogSource(logSourceId, { enabled: false });
  }

  async listStoryTimeAnchors(query: StoryTimeAnchorListQuery) {
    const { page, pageSize, skip } = this.parsePage(query);
    const campaignId = this.optionalString(query.campaignId);
    const logSourceId = this.optionalString(query.logSourceId);
    const from = query.from ? this.parseDate(query.from, 'from') : null;
    const to = query.to ? this.parseDate(query.to, 'to') : null;
    this.validateDateRange(from, to, 'from', 'to', false);

    if (campaignId) await this.requireCampaign(campaignId);
    if (logSourceId) {
      const source = campaignId
        ? await this.requireLogSourceInCampaign(logSourceId, campaignId)
        : await this.requireLogSource(logSourceId);
      if (campaignId && source.campaignId !== campaignId) {
        throw new BadRequestException('log source belongs to another campaign');
      }
    }

    const where: Prisma.StoryTimeAnchorWhereInput = {
      ...(campaignId ? { campaignId } : {}),
      ...(logSourceId ? { logSourceId } : {}),
      ...(from ? { sourceEndAt: { gt: from } } : {}),
      ...(to ? { sourceStartAt: { lt: to } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.storyTimeAnchor.findMany({
        where,
        orderBy: { sourceStartAt: 'asc' },
        skip,
        take: pageSize,
        include: { campaign: true, logSource: true },
      }),
      this.prisma.storyTimeAnchor.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async findStoryTimeForSourceTimestamp(
    logSourceId: string,
    rawTimestamp: unknown,
  ) {
    await this.requireLogSource(logSourceId);
    const timestamp = this.parseDate(rawTimestamp, 'timestamp');
    return this.prisma.storyTimeAnchor.findFirst({
      where: {
        logSourceId,
        sourceStartAt: { lte: timestamp },
        sourceEndAt: { gt: timestamp },
      },
      orderBy: { sourceStartAt: 'desc' },
    });
  }

  async createStoryTimeAnchor(
    campaignId: string,
    body: CreateStoryTimeAnchorBody,
  ) {
    await this.requireCampaign(campaignId);
    const data = await this.buildStoryTimeAnchorData(campaignId, body);
    await this.ensureStoryTimeAnchorDoesNotOverlap(
      data.logSourceId,
      data.sourceStartAt,
      data.sourceEndAt,
    );
    try {
      return await this.prisma.storyTimeAnchor.create({ data });
    } catch (e) {
      this.mapPrismaError(e);
    }
  }

  async updateStoryTimeAnchor(
    anchorId: string,
    body: UpdateStoryTimeAnchorBody,
  ) {
    const current = await this.requireStoryTimeAnchor(anchorId);
    const data = await this.buildStoryTimeAnchorUpdateData(current, body);
    const nextStartAt =
      data.sourceStartAt instanceof Date
        ? data.sourceStartAt
        : current.sourceStartAt;
    const nextEndAt =
      data.sourceEndAt instanceof Date ? data.sourceEndAt : current.sourceEndAt;
    await this.ensureStoryTimeAnchorDoesNotOverlap(
      current.logSourceId,
      nextStartAt,
      nextEndAt,
      anchorId,
    );
    try {
      return await this.prisma.storyTimeAnchor.update({
        where: { id: anchorId },
        data,
      });
    } catch (e) {
      this.mapPrismaError(e);
    }
  }

  async deleteStoryTimeAnchor(anchorId: string) {
    try {
      await this.prisma.storyTimeAnchor.delete({
        where: { id: this.requireString(anchorId, 'anchorId') },
      });
      return { ok: true };
    } catch (e) {
      this.mapPrismaError(e);
    }
  }

  async listActorRules(campaignId: string, query: ActorRuleListQuery) {
    await this.requireCampaign(campaignId);
    const { page, pageSize, skip } = this.parsePage(query);
    const search = this.trimString(query.search);
    const resultType = this.optionalEnum(
      query.resultType,
      ACTOR_RULE_RESULT_TYPES,
      'resultType',
    );
    const logSourceId = this.optionalString(query.logSourceId);
    if (logSourceId) {
      await this.requireLogSourceInCampaign(logSourceId, campaignId);
    }
    const where: Prisma.ActorRuleWhereInput = {
      campaignId,
      ...(resultType ? { resultType } : {}),
      ...(logSourceId ? { logSourceId } : {}),
      ...(search
        ? {
            OR: [
              { pattern: { contains: search, mode: 'insensitive' } },
              {
                normalizedPattern: {
                  contains: this.normalizeText(search),
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.actorRule.findMany({
        where,
        orderBy: [{ enabled: 'desc' }, { updatedAt: 'desc' }],
        skip,
        take: pageSize,
        include: { person: true, logSource: true },
      }),
      this.prisma.actorRule.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async createActorRule(campaignId: string, body: CreateActorRuleBody) {
    await this.requireCampaign(campaignId);
    const data = await this.buildActorRuleData(campaignId, body, true);
    await this.ensureActorRuleScopeAvailable(
      campaignId,
      data.normalizedPattern,
      data.logSourceId ?? null,
    );
    try {
      return await this.prisma.actorRule.create({ data });
    } catch (e) {
      this.mapPrismaError(e);
    }
  }

  async updateActorRule(ruleId: string, body: UpdateActorRuleBody) {
    const current = await this.requireActorRule(ruleId);
    const merged = {
      pattern: body.pattern ?? current.pattern,
      resultType: body.resultType ?? current.resultType,
      personId: body.personId === undefined ? current.personId : body.personId,
      logSourceId:
        body.logSourceId === undefined ? current.logSourceId : body.logSourceId,
      enabled: body.enabled === undefined ? current.enabled : body.enabled,
    };
    const data = await this.buildActorRuleData(
      current.campaignId,
      merged,
      true,
    );
    await this.ensureActorRuleScopeAvailable(
      current.campaignId,
      data.normalizedPattern,
      data.logSourceId ?? null,
      ruleId,
    );
    try {
      return await this.prisma.actorRule.update({
        where: { id: ruleId },
        data,
      });
    } catch (e) {
      this.mapPrismaError(e);
    }
  }

  async disableActorRule(ruleId: string) {
    await this.requireActorRule(ruleId);
    return this.prisma.actorRule.update({
      where: { id: ruleId },
      data: { enabled: false },
    });
  }

  async listLogSourceCoverages(
    logSourceId: string,
    query: LogSourceCoverageListQuery,
  ) {
    await this.requireLogSource(logSourceId);
    const startAt = query.startAt
      ? this.parseDate(query.startAt, 'startAt')
      : null;
    const endAt = query.endAt ? this.parseDate(query.endAt, 'endAt') : null;
    const where: Prisma.LogSourceCoverageWhereInput = {
      logSourceId,
      ...(startAt ? { endAt: { gte: startAt } } : {}),
      ...(endAt ? { startAt: { lte: endAt } } : {}),
    };
    return this.prisma.logSourceCoverage.findMany({
      where,
      orderBy: { startAt: 'desc' },
    });
  }

  async createLogSourceCoverage(
    logSourceId: string,
    body: CreateLogSourceCoverageBody,
  ) {
    await this.requireLogSource(logSourceId);
    const data = this.buildCoverageData(logSourceId, body, true);
    try {
      return await this.prisma.logSourceCoverage.create({ data });
    } catch (e) {
      this.mapPrismaError(e);
    }
  }

  async updateLogSourceCoverage(
    coverageId: string,
    body: UpdateLogSourceCoverageBody,
  ) {
    const current = await this.requireCoverage(coverageId);
    const data = this.buildCoverageUpdateData(current, body);
    try {
      return await this.prisma.logSourceCoverage.update({
        where: { id: coverageId },
        data,
      });
    } catch (e) {
      this.mapPrismaError(e);
    }
  }

  async deleteLogSourceCoverage(coverageId: string) {
    try {
      await this.prisma.logSourceCoverage.delete({ where: { id: coverageId } });
      return { ok: true };
    } catch (e) {
      this.mapPrismaError(e);
    }
  }

  private async requireCampaign(campaignId: string) {
    const id = this.requireString(campaignId, 'campaignId');
    const campaign = await this.prisma.campaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException('campaign not found');
    return campaign;
  }

  private async requirePerson(personId: string) {
    const id = this.requireString(personId, 'personId');
    const person = await this.prisma.person.findUnique({ where: { id } });
    if (!person) throw new NotFoundException('person not found');
    return person;
  }

  private async requireAlias(aliasId: string) {
    const alias = await this.prisma.personAlias.findUnique({
      where: { id: this.requireString(aliasId, 'aliasId') },
    });
    if (!alias) throw new NotFoundException('alias not found');
    return alias;
  }

  private async requireAffinity(affinityId: string) {
    const affinity = await this.prisma.affinity.findUnique({
      where: { id: this.requireString(affinityId, 'affinityId') },
    });
    if (!affinity) throw new NotFoundException('affinity not found');
    return affinity;
  }

  private async requireParticipant(participantId: string) {
    const participant = await this.prisma.campaignParticipant.findUnique({
      where: { id: this.requireString(participantId, 'participantId') },
    });
    if (!participant) throw new NotFoundException('participant not found');
    return participant;
  }

  private async requireLogSource(logSourceId: string) {
    const source = await this.prisma.discordLogSource.findUnique({
      where: { id: this.requireString(logSourceId, 'logSourceId') },
    });
    if (!source) throw new NotFoundException('log source not found');
    return source;
  }

  private async requireActorRule(ruleId: string) {
    const rule = await this.prisma.actorRule.findUnique({
      where: { id: this.requireString(ruleId, 'actorRuleId') },
    });
    if (!rule) throw new NotFoundException('actor rule not found');
    return rule;
  }

  private async requireCoverage(coverageId: string) {
    const coverage = await this.prisma.logSourceCoverage.findUnique({
      where: { id: this.requireString(coverageId, 'coverageId') },
    });
    if (!coverage) throw new NotFoundException('coverage not found');
    return coverage;
  }

  private async requireStoryTimeAnchor(anchorId: string) {
    const anchor = await this.prisma.storyTimeAnchor.findUnique({
      where: { id: this.requireString(anchorId, 'anchorId') },
    });
    if (!anchor) throw new NotFoundException('story time anchor not found');
    return anchor;
  }

  private async requireLogSourceInCampaign(
    logSourceId: string,
    campaignId: string,
  ) {
    const source = await this.requireLogSource(logSourceId);
    if (source.campaignId !== campaignId) {
      throw new BadRequestException('log source belongs to another campaign');
    }
    return source;
  }

  private async requirePcInCampaign(
    personId: string,
    campaignId: string,
    field: string,
  ) {
    const person = await this.requirePerson(personId);
    if (person.campaignId !== campaignId) {
      throw new BadRequestException(`${field} belongs to another campaign`);
    }
    if (person.type !== 'PC') {
      throw new BadRequestException(`${field} must reference a PC`);
    }
    return person;
  }

  private async requireWebUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('web user not found');
    return user;
  }

  private async ensureAliasScopeAvailable(
    campaignId: string,
    normalizedAlias: string,
    logSourceId: string | null,
    exceptAliasId?: string,
  ) {
    const conflict = await this.prisma.personAlias.findFirst({
      where: {
        normalizedAlias,
        logSourceId,
        ...(exceptAliasId ? { id: { not: exceptAliasId } } : {}),
        person: { campaignId },
      },
    });
    if (conflict) {
      throw new ConflictException('alias already exists in the same scope');
    }
  }

  private async ensureActorRuleScopeAvailable(
    campaignId: string,
    normalizedPattern: string,
    logSourceId: string | null,
    exceptRuleId?: string,
  ) {
    const conflict = await this.prisma.actorRule.findFirst({
      where: {
        campaignId,
        normalizedPattern,
        logSourceId,
        ...(exceptRuleId ? { id: { not: exceptRuleId } } : {}),
      },
    });
    if (conflict) {
      throw new ConflictException(
        'actor rule already exists in the same scope',
      );
    }
  }

  private async buildAffinityData(
    sourcePersonId: string,
    targetPersonId: string,
    valueType: AffinityValueType,
    body: {
      numericValue?: unknown;
      textValue?: unknown;
      comment?: unknown;
    },
  ) {
    if (sourcePersonId === targetPersonId) {
      throw new BadRequestException('self affinity is not allowed');
    }
    const [source, target] = await Promise.all([
      this.requirePerson(sourcePersonId),
      this.requirePerson(targetPersonId),
    ]);
    if (source.campaignId !== target.campaignId) {
      throw new BadRequestException('persons belong to different campaigns');
    }
    const comment = this.optionalString(body.comment);
    if (valueType === 'NUMBER') {
      const numericValue = Math.trunc(Number(body.numericValue));
      if (!Number.isFinite(numericValue)) {
        throw new BadRequestException('numericValue required');
      }
      return {
        sourcePersonId,
        targetPersonId,
        valueType,
        numericValue,
        textValue: null,
        comment,
      };
    }
    const textValue = this.requireString(body.textValue, 'textValue');
    return {
      sourcePersonId,
      targetPersonId,
      valueType,
      numericValue: null,
      textValue,
      comment,
    };
  }

  private async buildLogSourceData(
    campaignId: string,
    body: CreateDiscordLogSourceBody,
    requireAll: boolean,
  ): Promise<Prisma.DiscordLogSourceUncheckedCreateInput> {
    const defaultPcId = this.optionalString(body.defaultPcId);
    if (defaultPcId) {
      await this.requirePcInCampaign(defaultPcId, campaignId, 'defaultPcId');
    }
    const activeFrom = this.optionalDate(body.activeFrom, 'activeFrom') ?? null;
    const activeTo = this.optionalDate(body.activeTo, 'activeTo') ?? null;
    this.validateDateRange(
      activeFrom,
      activeTo,
      'activeFrom',
      'activeTo',
      true,
    );
    return {
      campaignId,
      guildId: requireAll
        ? this.requireString(body.guildId, 'guildId')
        : this.trimString(body.guildId),
      channelId: requireAll
        ? this.requireString(body.channelId, 'channelId')
        : this.trimString(body.channelId),
      displayName: requireAll
        ? this.requireString(body.displayName, 'displayName')
        : this.trimString(body.displayName),
      sourceType: this.requireEnum(
        body.sourceType,
        DISCORD_LOG_SOURCE_TYPES,
        'sourceType',
      ),
      defaultPcId,
      enabled: this.optionalBoolean(body.enabled) ?? true,
      activeFrom,
      activeTo,
      operatorNote: this.optionalString(body.operatorNote),
    };
  }

  private async buildLogSourceUpdateData(
    current: {
      campaignId: string;
      activeFrom: Date | null;
      activeTo: Date | null;
    },
    body: UpdateDiscordLogSourceBody,
  ): Promise<Prisma.DiscordLogSourceUpdateInput> {
    const data: Prisma.DiscordLogSourceUpdateInput = {};
    if (body.guildId !== undefined) {
      data.guildId = this.requireString(body.guildId, 'guildId');
    }
    if (body.channelId !== undefined) {
      data.channelId = this.requireString(body.channelId, 'channelId');
    }
    if (body.displayName !== undefined) {
      data.displayName = this.requireString(body.displayName, 'displayName');
    }
    const sourceType = this.optionalEnum(
      body.sourceType,
      DISCORD_LOG_SOURCE_TYPES,
      'sourceType',
    );
    if (sourceType) data.sourceType = sourceType;
    if (body.defaultPcId !== undefined) {
      const defaultPcId = this.optionalString(body.defaultPcId);
      if (defaultPcId) {
        await this.requirePcInCampaign(
          defaultPcId,
          current.campaignId,
          'defaultPcId',
        );
      }
      data.defaultPc = defaultPcId
        ? { connect: { id: defaultPcId } }
        : { disconnect: true };
    }
    const enabled = this.optionalBoolean(body.enabled);
    if (enabled !== undefined) data.enabled = enabled;
    const activeFrom = this.optionalDate(body.activeFrom, 'activeFrom');
    const activeTo = this.optionalDate(body.activeTo, 'activeTo');
    this.validateDateRange(
      activeFrom === undefined ? current.activeFrom : activeFrom,
      activeTo === undefined ? current.activeTo : activeTo,
      'activeFrom',
      'activeTo',
      true,
    );
    if (activeFrom !== undefined) data.activeFrom = activeFrom;
    if (activeTo !== undefined) data.activeTo = activeTo;
    if (body.operatorNote !== undefined) {
      data.operatorNote = this.optionalString(body.operatorNote);
    }
    return data;
  }

  private async buildActorRuleData(
    campaignId: string,
    body: CreateActorRuleBody | UpdateActorRuleBody,
    requireAll: boolean,
  ): Promise<Prisma.ActorRuleUncheckedCreateInput> {
    const pattern = requireAll
      ? this.requireString(body.pattern, 'pattern')
      : this.trimString(body.pattern);
    const resultType = this.requireEnum(
      body.resultType,
      ACTOR_RULE_RESULT_TYPES,
      'resultType',
    );
    const logSourceId = this.optionalString(body.logSourceId);
    if (logSourceId) {
      await this.requireLogSourceInCampaign(logSourceId, campaignId);
    }
    let personId: string | null = null;
    if (resultType === 'TRACKED_PERSON') {
      personId = this.requireString(body.personId, 'personId');
      const person = await this.requirePerson(personId);
      if (person.campaignId !== campaignId) {
        throw new BadRequestException('person belongs to another campaign');
      }
    }
    return {
      campaignId,
      pattern,
      normalizedPattern: this.normalizeText(pattern),
      resultType,
      personId,
      logSourceId,
      enabled: this.optionalBoolean(body.enabled) ?? true,
    };
  }

  private buildCoverageData(
    logSourceId: string,
    body: CreateLogSourceCoverageBody,
    requireAll: boolean,
  ): Prisma.LogSourceCoverageUncheckedCreateInput {
    const startAt = requireAll
      ? this.parseDate(body.startAt, 'startAt')
      : new Date();
    const endAt = requireAll ? this.parseDate(body.endAt, 'endAt') : new Date();
    this.validateDateRange(startAt, endAt, 'startAt', 'endAt', false);
    return {
      logSourceId,
      startAt,
      endAt,
      collectionStatus:
        this.optionalEnum(
          body.collectionStatus,
          COLLECTION_COVERAGE_STATUSES,
          'collectionStatus',
        ) ?? 'UNKNOWN',
      archiveConfidenceStatus:
        this.optionalEnum(
          body.archiveConfidenceStatus,
          ARCHIVE_CONFIDENCE_STATUSES,
          'archiveConfidenceStatus',
        ) ?? 'UNKNOWN',
      note: this.optionalString(body.note),
    };
  }

  private buildCoverageUpdateData(
    current: {
      startAt: Date;
      endAt: Date;
    },
    body: UpdateLogSourceCoverageBody,
  ): Prisma.LogSourceCoverageUpdateInput {
    const data: Prisma.LogSourceCoverageUpdateInput = {};
    const startAt =
      this.optionalDate(body.startAt, 'startAt') ?? current.startAt;
    const endAt = this.optionalDate(body.endAt, 'endAt') ?? current.endAt;
    this.validateDateRange(startAt, endAt, 'startAt', 'endAt', false);
    if (body.startAt !== undefined) data.startAt = startAt;
    if (body.endAt !== undefined) data.endAt = endAt;
    const collectionStatus = this.optionalEnum(
      body.collectionStatus,
      COLLECTION_COVERAGE_STATUSES,
      'collectionStatus',
    );
    if (collectionStatus) data.collectionStatus = collectionStatus;
    const archiveConfidenceStatus = this.optionalEnum(
      body.archiveConfidenceStatus,
      ARCHIVE_CONFIDENCE_STATUSES,
      'archiveConfidenceStatus',
    );
    if (archiveConfidenceStatus) {
      data.archiveConfidenceStatus = archiveConfidenceStatus;
    }
    if (body.note !== undefined) data.note = this.optionalString(body.note);
    return data;
  }

  private async buildStoryTimeAnchorData(
    campaignId: string,
    body: CreateStoryTimeAnchorBody,
  ): Promise<StoryTimeAnchorCreateData> {
    const logSourceId = this.requireString(body.logSourceId, 'logSourceId');
    await this.requireLogSourceInCampaign(logSourceId, campaignId);
    const sourceStartAt = this.parseDate(body.sourceStartAt, 'sourceStartAt');
    const sourceEndAt = this.parseDate(body.sourceEndAt, 'sourceEndAt');
    this.validateDateRange(
      sourceStartAt,
      sourceEndAt,
      'sourceStartAt',
      'sourceEndAt',
      false,
    );
    const storyDay = this.optionalInteger(body.storyDay, 'storyDay') ?? null;
    const storyTimeLabel = this.optionalString(body.storyTimeLabel);
    this.validateStoryTimeValue(storyDay, storyTimeLabel);
    return {
      campaignId,
      logSourceId,
      sourceStartAt,
      sourceEndAt,
      storyDay,
      storyTimeLabel,
      note: this.optionalString(body.note),
    };
  }

  private async buildStoryTimeAnchorUpdateData(
    current: {
      sourceStartAt: Date;
      sourceEndAt: Date;
      storyDay: number | null;
      storyTimeLabel: string | null;
    },
    body: UpdateStoryTimeAnchorBody,
  ): Promise<Prisma.StoryTimeAnchorUpdateInput> {
    const data: Prisma.StoryTimeAnchorUpdateInput = {};
    const sourceStartAt =
      this.optionalDate(body.sourceStartAt, 'sourceStartAt') ??
      current.sourceStartAt;
    const sourceEndAt =
      this.optionalDate(body.sourceEndAt, 'sourceEndAt') ?? current.sourceEndAt;
    this.validateDateRange(
      sourceStartAt,
      sourceEndAt,
      'sourceStartAt',
      'sourceEndAt',
      false,
    );
    if (body.sourceStartAt !== undefined) data.sourceStartAt = sourceStartAt;
    if (body.sourceEndAt !== undefined) data.sourceEndAt = sourceEndAt;

    const parsedStoryDay = this.optionalInteger(body.storyDay, 'storyDay');
    const storyDay =
      parsedStoryDay === undefined ? current.storyDay : parsedStoryDay;
    const storyTimeLabel =
      body.storyTimeLabel === undefined
        ? current.storyTimeLabel
        : this.optionalString(body.storyTimeLabel);
    this.validateStoryTimeValue(storyDay, storyTimeLabel);
    if (body.storyDay !== undefined) data.storyDay = storyDay;
    if (body.storyTimeLabel !== undefined) data.storyTimeLabel = storyTimeLabel;
    if (body.note !== undefined) data.note = this.optionalString(body.note);
    return data;
  }

  private validateStoryTimeValue(
    storyDay: number | null,
    storyTimeLabel: string | null,
  ) {
    if (storyDay === null && !storyTimeLabel) {
      throw new BadRequestException(
        'storyDay or storyTimeLabel must be provided',
      );
    }
  }

  private async ensureStoryTimeAnchorDoesNotOverlap(
    logSourceId: string,
    sourceStartAt: Date,
    sourceEndAt: Date,
    exceptAnchorId?: string,
  ) {
    const conflict = await this.prisma.storyTimeAnchor.findFirst({
      where: {
        logSourceId,
        sourceStartAt: { lt: sourceEndAt },
        sourceEndAt: { gt: sourceStartAt },
        ...(exceptAnchorId ? { id: { not: exceptAnchorId } } : {}),
      },
    });
    if (conflict) {
      throw new ConflictException(
        'story time anchor overlaps an existing anchor in the same log source',
      );
    }
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
}
