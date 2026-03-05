import { Injectable, Logger } from '@nestjs/common';
import {
  ChannelType,
  Client,
  PermissionFlagsBits,
  type Message,
} from 'discord.js';
import { PrismaClient } from '@prisma/client';

type SearchScope = 'spell' | 'skill';

type SearchDoc = {
  scope: SearchScope;
  title: string;
  normalizedTitle: string;
  body: string;
  messageUrl: string;
  messageId: string;
  channelId: string;
  channelName: string;
  threadId?: string;
  threadName?: string;
};

type SearchIndex = {
  syncedAt: number;
};

type SearchMatch = {
  doc: SearchDoc;
  score: number;
};

type ScopeDiag = {
  scope: SearchScope;
  channelId: string;
  channelName: string;
  channelType: string;
  fetchOk: boolean;
  canView: boolean | null;
  canReadHistory: boolean | null;
  canSend: boolean | null;
  sampleFetchOk: boolean;
  sampleMessageCount: number;
  threadCount: number;
  warnings: string[];
};

type SpellParsed = {
  spellKey: string;
  sourceMessageId: string;
  sourceMessageUrl: string;
  sourceChannelId: string;
  sourceChannelName: string;
  sourceThreadId?: string;
  sourceThreadName?: string;
  spellLevel: string;
  spellNumber?: number;
  spellName: string;
  titleRaw: string;
  normalizedName: string;
  school?: string;
  rangeText?: string;
  damage?: string;
  learnText?: string;
  checkText?: string;
  concentration?: string;
  duration?: string;
  castCost?: string;
  etcText?: string;
  commentText?: string;
  componentsText?: string;
  bodyRaw: string;
};

type SkillParsed = {
  skillKey: string;
  sourceMessageId: string;
  sourceMessageUrl: string;
  sourceChannelId: string;
  sourceChannelName: string;
  sourceThreadId?: string;
  sourceThreadName?: string;
  jobName: string;
  skillName: string;
  conditionText?: string;
  titleRaw: string;
  normalizedName: string;
  bodyRaw: string;
};

const SPELL_LABELS = [
  '학파',
  '사거리',
  '피해',
  '습득',
  '판정',
  '집중',
  '지속',
  '발동 시 소모',
  '기타',
] as const;

function parseIdList(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(/[,\s]+/)
    .map((v) => v.trim())
    .filter((v) => !!v);
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '');
}

function unansi(s: string): string {
  return s.replace(/\u001b\[[0-9;]*m/g, '');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractBlocks(
  content: string,
): Array<{ lang: string; body: string; start: number; end: number }> {
  const out: Array<{ lang: string; body: string; start: number; end: number }> = [];
  const re = /```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g;
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(content)) !== null) {
    const start = m.index;
    const end = m.index + m[0].length;
    out.push({
      lang: (m[1] ?? '').trim(),
      body: (m[2] ?? '').trim(),
      start,
      end,
    });
  }
  return out;
}

function parseTitle(raw: string): string {
  const oneLine = raw.trim().split('\n')[0]?.trim() ?? '';
  return oneLine.replace(/^\d+\.\s*/, '').trim();
}

function parseTitleRaw(raw: string): string {
  return raw.trim().split('\n')[0]?.trim() ?? '';
}

function stripFenceBoldWrapper(text: string): string {
  let s = text;
  s = s.replace(/^\*\*\s*\n(?=```)/, '');
  s = s.replace(/\n\*\*\s*\n(?=```)/g, '\n');
  s = s.replace(/(?<=```)\s*\n\*\*$/g, '');
  s = s.replace(/(?<=```)\s*\n\*\*\s*\n/g, '\n');
  return s.trim();
}

function scoreTitle(docTitle: string, keyword: string): number {
  const t = normalize(docTitle);
  const q = normalize(keyword);
  if (!q) return 0;
  if (t === q) return 1000;
  if (t.startsWith(q)) return 800;
  const idx = t.indexOf(q);
  if (idx >= 0) return 600 - Math.min(idx, 250);
  return 0;
}

function parseSpellLevelFromChannelName(channelName: string): string {
  if (/소마법/i.test(channelName)) return '소마법';
  const m = channelName.match(/(\d+)\s*레벨/);
  if (m) return `${m[1]}레벨`;
  return channelName;
}

function parseJobFromChannelName(channelName: string): string | undefined {
  // 기술-{직업이름}직업군 / 기술-{직업이름}
  const m = channelName.match(/^기술[-_\s]*([^-_\s].*?)(?:직업군)?$/);
  if (!m) return undefined;
  const v = (m[1] ?? '').trim();
  return v || undefined;
}

function parseComponentsFromTail(tail: string): string | undefined {
  const parts = [...tail.matchAll(/`([^`]+)`/g)]
    .map((m) => (m[1] ?? '').trim())
    .filter((v) => !!v);
  if (!parts.length) return undefined;
  return parts.join(', ');
}

function parseLabeledFields(text: string): Record<string, string> {
  const clean = unansi(text).replace(/\r/g, '');
  const escaped = SPELL_LABELS.map((l) => escapeRegExp(l)).join('|');
  const re = new RegExp(`(^|\\n)\\s*(${escaped})\\s*:\\s*`, 'g');
  const hits: Array<{ label: string; start: number; end: number }> = [];
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(clean)) !== null) {
    hits.push({
      label: m[2],
      start: m.index + (m[1]?.length ?? 0),
      end: re.lastIndex,
    });
  }
  const out: Record<string, string> = {};
  for (let i = 0; i < hits.length; i += 1) {
    const cur = hits[i];
    const next = hits[i + 1];
    const value = clean.slice(cur.end, next?.start ?? clean.length).trim();
    out[cur.label] = value;
  }
  return out;
}

@Injectable()
export class DiceSearchService {
  private readonly logger = new Logger(DiceSearchService.name);
  private index: SearchIndex = { syncedAt: 0 };

  constructor(
    private readonly client: Client,
    private readonly prisma: PrismaClient,
  ) {}

  getSpellChannelIds(): string[] {
    return parseIdList(process.env.SSPELL_CHANNEL_IDS);
  }

  getSkillChannelIds(): string[] {
    return parseIdList(process.env.SSKILL_CHANNEL_IDS);
  }

  hasConfiguredChannels(scope: SearchScope | 'all' = 'all') {
    if (scope === 'spell') return this.getSpellChannelIds().length > 0;
    if (scope === 'skill') return this.getSkillChannelIds().length > 0;
    return (
      this.getSpellChannelIds().length > 0 ||
      this.getSkillChannelIds().length > 0
    );
  }

  getSyncedAt() {
    return this.index.syncedAt;
  }

  async syncAll(): Promise<{ spells: number; skills: number; syncedAt: number }> {
    const spells = await this.syncSpellsToDb();
    const skills = await this.syncSkillsToDb();
    const syncedAt = Date.now();
    this.index = { syncedAt };
    return { spells, skills, syncedAt };
  }

  async searchTop(scope: SearchScope, keyword: string): Promise<SearchMatch | null> {
    if (scope === 'skill') {
      return this.searchSkillTopDb(keyword);
    }
    return this.searchSpellTopDb(keyword);
  }

  async searchSpellByLevelAndNumber(
    level: number,
    number: number,
  ): Promise<SearchMatch | null> {
    const model = this.getSpellModel();
    const row = await model.findFirst({
      where: {
        spellLevel: `${level}레벨`,
        spellNumber: number,
      },
      select: {
        sourceMessageId: true,
        sourceMessageUrl: true,
        sourceChannelId: true,
        sourceChannelName: true,
        sourceThreadId: true,
        sourceThreadName: true,
        titleRaw: true,
        spellName: true,
        bodyRaw: true,
      },
    });
    if (!row) return null;

    const title = (row.titleRaw ?? row.spellName ?? '').trim();
    const doc: SearchDoc = {
      scope: 'spell',
      title,
      normalizedTitle: normalize(title),
      body: (row.bodyRaw ?? '').trim(),
      messageUrl: row.sourceMessageUrl,
      messageId: row.sourceMessageId,
      channelId: row.sourceChannelId,
      channelName: row.sourceChannelName,
      threadId: row.sourceThreadId ?? undefined,
      threadName: row.sourceThreadName ?? undefined,
    };
    return { doc, score: 2000 };
  }

  async searchSpellNamesByCategory(
    levelKeyword: string,
    schoolKeyword: string,
    learnKeyword?: string,
  ): Promise<string[]> {
    const levelRaw = (levelKeyword ?? '').trim();
    const schoolRaw = (schoolKeyword ?? '').trim();
    const learnRaw = (learnKeyword ?? '').trim();
    if (!levelRaw || !schoolRaw) return [];

    const levelNumOnly = levelRaw.match(/^\d+$/);
    const levelNumLabel = levelRaw.match(/^(\d+)\s*레벨$/);
    const normalizedLevel = /소마법/i.test(levelRaw)
      ? '소마법'
      : levelNumOnly
        ? `${levelRaw}레벨`
        : levelNumLabel
          ? `${levelNumLabel[1]}레벨`
          : levelRaw;

    const model = this.getSpellModel();
    const where: any = {
      spellLevel: normalizedLevel,
      school: {
        contains: schoolRaw,
        mode: 'insensitive',
      },
    };
    if (learnRaw) {
      where.learnText = {
        contains: learnRaw,
        mode: 'insensitive',
      };
    }

    const rows: any[] = await model.findMany({
      where,
      select: {
        spellName: true,
        spellNumber: true,
      },
      orderBy: [{ spellNumber: 'asc' }, { spellName: 'asc' }],
    });

    const names: string[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const name = (row.spellName ?? '').trim();
      if (!name) continue;
      const line =
        Number.isFinite(row.spellNumber) && row.spellNumber > 0
          ? `${row.spellNumber}. ${name}`
          : name;
      if (seen.has(line)) continue;
      seen.add(line);
      names.push(line);
    }
    return names;
  }

  async diagnoseConfiguredChannels(): Promise<ScopeDiag[]> {
    const out: ScopeDiag[] = [];
    for (const id of this.getSpellChannelIds()) {
      out.push(await this.diagnoseOne('spell', id));
    }
    for (const id of this.getSkillChannelIds()) {
      out.push(await this.diagnoseOne('skill', id));
    }
    return out;
  }

  private getSpellModel(): any {
    const model = (this.prisma as any).spellEntry;
    if (!model) {
      throw new Error(
        'SpellEntry 모델이 Prisma Client에 없습니다. prisma migrate + prisma generate를 실행해 주세요.',
      );
    }
    return model;
  }

  private getSkillModel(): any {
    const model = (this.prisma as any).skillEntry;
    if (!model) {
      throw new Error(
        'SkillEntry 모델이 Prisma Client에 없습니다. prisma migrate + prisma generate를 실행해 주세요.',
      );
    }
    return model;
  }

  private async searchSpellTopDb(keyword: string): Promise<SearchMatch | null> {
    const model = this.getSpellModel();
    const rows: any[] = await model.findMany({
      select: {
        sourceMessageId: true,
        sourceMessageUrl: true,
        sourceChannelId: true,
        sourceChannelName: true,
        sourceThreadId: true,
        sourceThreadName: true,
        titleRaw: true,
        spellName: true,
        bodyRaw: true,
      },
    });
    if (!rows.length) return null;

    let best: SearchMatch | null = null;
    for (const row of rows) {
      const title = (row.titleRaw ?? row.spellName ?? '').trim();
      const score = scoreTitle(title, keyword);
      if (score <= 0) continue;
      const doc: SearchDoc = {
        scope: 'spell',
        title,
        normalizedTitle: normalize(title),
        body: (row.bodyRaw ?? '').trim(),
        messageUrl: row.sourceMessageUrl,
        messageId: row.sourceMessageId,
        channelId: row.sourceChannelId,
        channelName: row.sourceChannelName,
        threadId: row.sourceThreadId ?? undefined,
        threadName: row.sourceThreadName ?? undefined,
      };
      if (!best || score > best.score) best = { doc, score };
    }
    return best;
  }

  private async searchSkillTopDb(keyword: string): Promise<SearchMatch | null> {
    const model = this.getSkillModel();
    const rows: any[] = await model.findMany({
      select: {
        sourceMessageId: true,
        sourceMessageUrl: true,
        sourceChannelId: true,
        sourceChannelName: true,
        sourceThreadId: true,
        sourceThreadName: true,
        titleRaw: true,
        skillName: true,
        bodyRaw: true,
      },
    });
    if (!rows.length) return null;

    let best: SearchMatch | null = null;
    for (const row of rows) {
      const title = (row.titleRaw ?? row.skillName ?? '').trim();
      const score = scoreTitle(title, keyword);
      if (score <= 0) continue;
      const doc: SearchDoc = {
        scope: 'skill',
        title,
        normalizedTitle: normalize(title),
        body: (row.bodyRaw ?? '').trim(),
        messageUrl: row.sourceMessageUrl,
        messageId: row.sourceMessageId,
        channelId: row.sourceChannelId,
        channelName: row.sourceChannelName,
        threadId: row.sourceThreadId ?? undefined,
        threadName: row.sourceThreadName ?? undefined,
      };
      if (!best || score > best.score) best = { doc, score };
    }
    return best;
  }

  private async syncSpellsToDb(): Promise<number> {
    const model = this.getSpellModel();
    const channelIds = this.getSpellChannelIds();
    let upsertCount = 0;

    for (const channelId of channelIds) {
      const ch = await this.client.channels.fetch(channelId).catch(() => null);
      if (!ch) {
        this.logger.warn(`Spell channel not found: ${channelId}`);
        continue;
      }

      if (this.canFetchMessages(ch as any)) {
        const messages = await this.fetchAllMessages(ch as any);
        for (const msg of messages) {
          const row = this.parseSpellFromMessage(msg, {
            channelId: ch.id,
            channelName: (ch as any).name ?? ch.id,
          });
          if (!row) continue;
          await this.upsertSpellSafe(model, row);
          upsertCount += 1;
        }
      }

      const threads = await this.fetchAllThreads(ch as any);
      for (const thread of threads) {
        const msgs = await this.fetchAllMessages(thread as any);
        for (const msg of msgs) {
          const row = this.parseSpellFromMessage(msg, {
            channelId: ch.id,
            channelName: (ch as any).name ?? ch.id,
            threadId: thread.id,
            threadName: thread.name,
          });
          if (!row) continue;
          await this.upsertSpellSafe(model, row);
          upsertCount += 1;
        }
      }
    }

    return upsertCount;
  }

  private async syncSkillsToDb(): Promise<number> {
    const model = this.getSkillModel();
    const channelIds = this.getSkillChannelIds();
    let upsertCount = 0;

    for (const channelId of channelIds) {
      const ch = await this.client.channels.fetch(channelId).catch(() => null);
      if (!ch) {
        this.logger.warn(`Skill channel not found: ${channelId}`);
        continue;
      }

      // 직업별 공통 기술: 채널 본문 메시지에서 파싱
      if (this.canFetchMessages(ch as any)) {
        const messages = await this.fetchAllMessages(ch as any);
        for (const msg of messages) {
          const row = this.parseSkillFromMessage(msg, {
            channelId: ch.id,
            channelName: (ch as any).name ?? ch.id,
          });
          if (!row) continue;
          await this.upsertSkillSafe(model, row);
          upsertCount += 1;
        }
      }

      const allThreads = await this.fetchAllThreads(ch as any);

      for (const thread of allThreads) {
        const msgs = await this.fetchAllMessages(thread as any);
        for (const msg of msgs) {
          const row = this.parseSkillFromMessage(msg, {
            channelId: ch.id,
            channelName: (ch as any).name ?? ch.id,
            threadId: thread.id,
            threadName: thread.name,
          });
          if (!row) continue;
          await this.upsertSkillSafe(model, row);
          upsertCount += 1;
        }
      }
    }
    return upsertCount;
  }

  private async upsertSpellSafe(model: any, row: SpellParsed) {
    // spellKey 기준으로 합치기 전에, 같은 sourceMessageId가 다른 key로 남아 있으면 제거
    const byMsg = await model.findUnique({
      where: { sourceMessageId: row.sourceMessageId },
      select: { spellKey: true },
    });
    if (byMsg && byMsg.spellKey !== row.spellKey) {
      await model.delete({ where: { sourceMessageId: row.sourceMessageId } });
    }

    try {
      await model.upsert({
        where: { spellKey: row.spellKey },
        create: row,
        update: row,
      });
    } catch (err: any) {
      if (err?.code !== 'P2002') throw err;
      // 동시/기존 데이터 꼬임으로 sourceMessageId unique 충돌 시 1회 정리 후 재시도
      const byMsg2 = await model.findUnique({
        where: { sourceMessageId: row.sourceMessageId },
        select: { spellKey: true },
      });
      if (byMsg2 && byMsg2.spellKey !== row.spellKey) {
        await model.delete({ where: { sourceMessageId: row.sourceMessageId } });
      }
      await model.upsert({
        where: { spellKey: row.spellKey },
        create: row,
        update: row,
      });
    }
  }

  private async upsertSkillSafe(model: any, row: SkillParsed) {
    const byMsg = await model.findUnique({
      where: { sourceMessageId: row.sourceMessageId },
      select: { skillKey: true },
    });
    if (byMsg && byMsg.skillKey !== row.skillKey) {
      await model.delete({ where: { sourceMessageId: row.sourceMessageId } });
    }

    try {
      await model.upsert({
        where: { skillKey: row.skillKey },
        create: row,
        update: row,
      });
    } catch (err: any) {
      if (err?.code !== 'P2002') throw err;
      const byMsg2 = await model.findUnique({
        where: { sourceMessageId: row.sourceMessageId },
        select: { skillKey: true },
      });
      if (byMsg2 && byMsg2.skillKey !== row.skillKey) {
        await model.delete({ where: { sourceMessageId: row.sourceMessageId } });
      }
      await model.upsert({
        where: { skillKey: row.skillKey },
        create: row,
        update: row,
      });
    }
  }

  private async fetchAllMessages(channel: any): Promise<Message[]> {
    if (!this.canFetchMessages(channel)) return [];
    const out: Message[] = [];
    let before: string | undefined = undefined;

    while (true) {
      const batch = await channel.messages
        .fetch({ limit: 100, before })
        .catch(() => null);
      if (!batch || batch.size === 0) break;
      out.push(...batch.values());
      const lastKey = batch.lastKey();
      if (!lastKey || batch.size < 100) break;
      before = lastKey;
    }

    return out;
  }

  private canFetchMessages(channel: any): boolean {
    return !!channel?.messages?.fetch;
  }

  private async fetchAllThreads(channel: any): Promise<any[]> {
    const out: any[] = [];

    if (
      channel?.type === ChannelType.PublicThread ||
      channel?.type === ChannelType.PrivateThread ||
      channel?.type === ChannelType.AnnouncementThread
    ) {
      return [channel];
    }

    if (!channel?.threads) return out;

    const active = await channel.threads.fetchActive?.().catch(() => null);
    const activeThreads = active ? [...active.threads.values()] : [];

    const archivedAny = await channel.threads
      .fetchArchived?.({ fetchAll: true })
      .catch(() => null);
    const archivedAnyThreads = archivedAny ? [...archivedAny.threads.values()] : [];

    const archivedPublic = await channel.threads
      .fetchArchived?.({ type: 'public', fetchAll: true })
      .catch(() => null);
    const archivedPublicThreads = archivedPublic
      ? [...archivedPublic.threads.values()]
      : [];

    const archivedPrivate = await channel.threads
      .fetchArchived?.({ type: 'private', fetchAll: true })
      .catch(() => null);
    const archivedPrivateThreads = archivedPrivate
      ? [...archivedPrivate.threads.values()]
      : [];

    const seen = new Set<string>();
    const merged = [
      ...activeThreads,
      ...archivedAnyThreads,
      ...archivedPublicThreads,
      ...archivedPrivateThreads,
    ];
    for (const t of merged) {
      if (!t?.id) continue;
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      out.push(t);
    }
    return out;
  }

  private async diagnoseOne(scope: SearchScope, channelId: string): Promise<ScopeDiag> {
    const warnings: string[] = [];
    const ch = await this.client.channels.fetch(channelId).catch((e) => {
      warnings.push(`fetch 실패: ${e?.message ?? e}`);
      return null;
    });

    if (!ch) {
      return {
        scope,
        channelId,
        channelName: '-',
        channelType: 'unknown',
        fetchOk: false,
        canView: null,
        canReadHistory: null,
        canSend: null,
        sampleFetchOk: false,
        sampleMessageCount: 0,
        threadCount: 0,
        warnings,
      };
    }

    const guild = (ch as any).guild ?? null;
    const me = guild?.members?.fetchMe
      ? await guild.members.fetchMe().catch((e: any) => {
          warnings.push(`fetchMe 실패: ${e?.message ?? e}`);
          return null;
        })
      : null;
    const perms = (ch as any).permissionsFor?.(me ?? this.client.user ?? null) ?? null;

    const canView = perms ? perms.has(PermissionFlagsBits.ViewChannel) : null;
    const canReadHistory = perms
      ? perms.has(PermissionFlagsBits.ReadMessageHistory)
      : null;
    const canSend = perms ? perms.has(PermissionFlagsBits.SendMessages) : null;

    let sampleFetchOk = false;
    let sampleMessageCount = 0;
    if (this.canFetchMessages(ch as any)) {
      const batch = await (ch as any).messages
        .fetch({ limit: 3 })
        .catch((e: any) => {
          warnings.push(`messages.fetch 실패: ${e?.message ?? e}`);
          return null;
        });
      if (batch) {
        sampleFetchOk = true;
        sampleMessageCount = batch.size ?? 0;
      }
    } else {
      warnings.push('이 채널 타입은 messages.fetch를 직접 지원하지 않음');
    }

    const threads = await this.fetchAllThreads(ch as any);
    const threadCount = threads.length;
    if (scope === 'skill' && threadCount === 0) {
      warnings.push('기술 채널 기준 스레드 0개');
    }

    return {
      scope,
      channelId: ch.id,
      channelName: (ch as any).name ?? ch.id,
      channelType: String(ch.type),
      fetchOk: true,
      canView,
      canReadHistory,
      canSend,
      sampleFetchOk,
      sampleMessageCount,
      threadCount,
      warnings,
    };
  }

  private parseSpellFromMessage(
    msg: Message,
    loc: {
      channelId: string;
      channelName: string;
      threadId?: string;
      threadName?: string;
    },
  ): SpellParsed | null {
    const content = (msg.content ?? '').trim();
    if (!content) return null;

    const blocks = extractBlocks(content);
    if (!blocks.length) return null;

    const first = blocks[0];
    const titleRaw = parseTitleRaw(first.body ?? '');
    if (!titleRaw) return null;

    const tMatch = titleRaw.match(/^(\d+)\.\s*(.+)$/);
    const spellNumber = tMatch ? Number.parseInt(tMatch[1], 10) : undefined;
    const spellName = (tMatch ? tMatch[2] : titleRaw).trim();
    if (!spellName) return null;

    const bodyRaw = stripFenceBoldWrapper(content.slice(first.end).trim());
    if (!bodyRaw) return null;

    // 메인 필드 블록(학파/사거리/...) 추정
    let mainBlockIdx = -1;
    let mainHit = -1;
    for (let i = 1; i < blocks.length; i += 1) {
      const clean = unansi(blocks[i].body ?? '');
      let hit = 0;
      for (const label of SPELL_LABELS) {
        if (clean.includes(`${label}:`)) hit += 1;
      }
      if (hit > mainHit) {
        mainHit = hit;
        mainBlockIdx = i;
      }
    }

    const fields = mainBlockIdx >= 1 ? parseLabeledFields(blocks[mainBlockIdx].body) : {};
    const extraBlocks = blocks
      .filter((_, i) => i !== 0 && i !== mainBlockIdx)
      .map((b) => unansi(b.body).trim())
      .filter((v) => !!v);
    const commentText = extraBlocks.length ? extraBlocks.join('\n\n') : undefined;

    const lastEnd = blocks[blocks.length - 1]?.end ?? first.end;
    const tail = content.slice(lastEnd).trim();
    const componentsText = parseComponentsFromTail(tail);

    const spellLevel = parseSpellLevelFromChannelName(loc.channelName);
    const spellKey = `${spellLevel}:${spellNumber ?? normalize(spellName)}`;

    return {
      spellKey,
      sourceMessageId: msg.id,
      sourceMessageUrl: msg.url,
      sourceChannelId: loc.channelId,
      sourceChannelName: loc.channelName,
      sourceThreadId: loc.threadId,
      sourceThreadName: loc.threadName,
      spellLevel,
      spellNumber,
      spellName,
      titleRaw,
      normalizedName: normalize(spellName),
      school: fields['학파'],
      rangeText: fields['사거리'],
      damage: fields['피해'],
      learnText: fields['습득'],
      checkText: fields['판정'],
      concentration: fields['집중'],
      duration: fields['지속'],
      castCost: fields['발동 시 소모'],
      etcText: fields['기타'],
      commentText,
      componentsText,
      bodyRaw,
    };
  }

  private parseMessageToDoc(
    scope: SearchScope,
    msg: Message,
    loc: {
      channelId: string;
      channelName: string;
      threadId?: string;
      threadName?: string;
    },
  ): SearchDoc | null {
    const content = (msg.content ?? '').trim();
    if (!content) return null;

    const blocks = extractBlocks(content);
    if (!blocks.length) return null;

    const first = blocks[0];
    const title = parseTitle(first.body ?? '');
    if (!title) return null;

    const body = stripFenceBoldWrapper(content.slice(first.end).trim());
    if (!body) return null;

    return {
      scope,
      title,
      normalizedTitle: normalize(title),
      body,
      messageUrl: msg.url,
      messageId: msg.id,
      channelId: loc.channelId,
      channelName: loc.channelName,
      threadId: loc.threadId,
      threadName: loc.threadName,
    };
  }

  private parseSkillFromMessage(
    msg: Message,
    loc: {
      channelId: string;
      channelName: string;
      threadId?: string;
      threadName?: string;
    },
  ): SkillParsed | null {
    const content = (msg.content ?? '').trim();
    if (!content) return null;

    const blocks = extractBlocks(content);
    if (!blocks.length) return null;

    const first = blocks[0];
    const titleRaw = parseTitleRaw(first.body ?? '');
    if (!titleRaw) return null;

    const idx = titleRaw.indexOf('(');
    const skillName =
      (idx >= 0 ? titleRaw.slice(0, idx) : titleRaw).trim() || titleRaw.trim();
    if (!skillName) return null;
    const conditionText = idx >= 0 ? titleRaw.slice(idx).trim() : undefined;

    const bodyRaw = stripFenceBoldWrapper(content.slice(first.end).trim());
    if (!bodyRaw) return null;

    const threadName = (loc.threadName ?? '').trim();
    const jobFromChannel = parseJobFromChannelName(loc.channelName);
    const jobFromThread = threadName
      ? threadName.replace(/^기술[-_\s]*/, '').trim()
      : undefined;
    const jobName =
      jobFromChannel || jobFromThread || threadName || loc.channelName || 'unknown';
    const skillKey = `${normalize(jobName)}:${normalize(skillName)}`;

    return {
      skillKey,
      sourceMessageId: msg.id,
      sourceMessageUrl: msg.url,
      sourceChannelId: loc.channelId,
      sourceChannelName: loc.channelName,
      sourceThreadId: loc.threadId,
      sourceThreadName: loc.threadName,
      jobName,
      skillName,
      conditionText,
      titleRaw,
      normalizedName: normalize(skillName),
      bodyRaw,
    };
  }
}
