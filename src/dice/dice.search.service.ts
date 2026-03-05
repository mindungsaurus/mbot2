import { Injectable, Logger } from '@nestjs/common';
import {
  ChannelType,
  Client,
  PermissionFlagsBits,
  type Message,
} from 'discord.js';

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
  spells: SearchDoc[];
  skills: SearchDoc[];
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

function stripFenceBoldWrapper(text: string): string {
  // 코드블록만 감싸는 굵게 래퍼(**)는 렌더 시 불필요하게 노출되므로 제거
  // 예: "**\n```ansi ... ```\n**" 또는 줄 중간의 "\n**\n```"
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

@Injectable()
export class DiceSearchService {
  private readonly logger = new Logger(DiceSearchService.name);
  private index: SearchIndex = { spells: [], skills: [], syncedAt: 0 };

  constructor(private readonly client: Client) {}

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
    const spells = await this.crawlSpells();
    const skills = await this.crawlSkills();
    const syncedAt = Date.now();
    this.index = { spells, skills, syncedAt };
    return { spells: spells.length, skills: skills.length, syncedAt };
  }

  async searchTop(scope: SearchScope, keyword: string): Promise<SearchMatch | null> {
    const list = scope === 'spell' ? this.index.spells : this.index.skills;
    if (!list.length) return null;

    let best: SearchMatch | null = null;
    for (const doc of list) {
      const score = scoreTitle(doc.title, keyword);
      if (score <= 0) continue;
      if (!best || score > best.score) {
        best = { doc, score };
      }
    }
    return best;
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

  private async crawlSpells(): Promise<SearchDoc[]> {
    const channelIds = this.getSpellChannelIds();
    const out: SearchDoc[] = [];
    for (const channelId of channelIds) {
      const ch = await this.client.channels.fetch(channelId).catch(() => null);
      if (!ch) {
        this.logger.warn(`Spell channel not found: ${channelId}`);
        continue;
      }

      // 기본: 채널 메시지 직접 수집
      if (this.canFetchMessages(ch as any)) {
        const messages = await this.fetchAllMessages(ch as any);
        for (const msg of messages) {
          const doc = this.parseMessageToDoc('spell', msg, {
            channelId: ch.id,
            channelName: (ch as any).name ?? ch.id,
          });
          if (doc) out.push(doc);
        }
      }

      // 포럼/스레드형 채널도 보조 수집
      const threads = await this.fetchAllThreads(ch as any);
      for (const thread of threads) {
        const msgs = await this.fetchAllMessages(thread as any);
        for (const msg of msgs) {
          const doc = this.parseMessageToDoc('spell', msg, {
            channelId: ch.id,
            channelName: (ch as any).name ?? ch.id,
            threadId: thread.id,
            threadName: thread.name,
          });
          if (doc) out.push(doc);
        }
      }
    }
    return out;
  }

  private async crawlSkills(): Promise<SearchDoc[]> {
    const channelIds = this.getSkillChannelIds();
    const out: SearchDoc[] = [];

    for (const channelId of channelIds) {
      const ch = await this.client.channels.fetch(channelId).catch(() => null);
      if (!ch) {
        this.logger.warn(`Skill channel not found: ${channelId}`);
        continue;
      }
      const allThreads = await this.fetchAllThreads(ch as any);

      for (const thread of allThreads) {
        const msgs = await this.fetchAllMessages(thread as any);
        for (const msg of msgs) {
          const doc = this.parseMessageToDoc('skill', msg, {
            channelId: ch.id,
            channelName: (ch as any).name ?? ch.id,
            threadId: thread.id,
            threadName: thread.name,
          });
          if (doc) out.push(doc);
        }
      }
    }
    return out;
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

    // 채널 자체가 스레드 ID인 경우
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

    // 제목 블록 이후의 원문을 그대로 유지한다.
    // ansi/ini 코드블록, 추가 설명, 키워드(`영창` 등) 라인을 모두 보존한다.
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
}
