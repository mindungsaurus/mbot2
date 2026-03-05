import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Context, SlashCommand, Options } from 'necord';
import type { SlashCommandContext } from 'necord';
import { CharacterGold } from '@prisma/client';
import { InteractionResponse } from 'discord.js';
import { DiceService } from './dice.service';
import { DiceExprDTO } from './dto/diceExpr-dto';
import { DiceExprTargetDTO } from './dto/diceExprTarget-dto';
import { GoldService, TextColor } from 'src/gold/gold.service';
import { DiceSearchService } from './dice.search.service';
import { SearchTitleDTO } from './dto/searchTitle-dto';
import { SearchSpellCategoryDTO } from './dto/searchSpellCategory-dto';
import { ALLOWED } from 'src/gold/gold.commands';

const CMP_SET = new Set(['>=', '>', '<=', '<', '==', '!=']);
const SEARCH_ENV_HINT = 'SSPELL_CHANNEL_IDS, SSKILL_CHANNEL_IDS';
const BOT_GUILDS = ['1284642997375336592', '1273347630767804539'];
const DISCORD_MSG_LIMIT = 1900;
const SSYNC_ALLOWED = new Set<string>(['1280856735023628308']);

function chunkText(text: string, maxLen: number): string[] {
  if (!text) return [''];
  if (text.length <= maxLen) return [text];

  const lines = text.split('\n');
  const out: string[] = [];
  let cur = '';
  for (const line of lines) {
    const candidate = cur ? `${cur}\n${line}` : line;
    if (candidate.length <= maxLen) {
      cur = candidate;
      continue;
    }
    if (cur) out.push(cur);
    if (line.length <= maxLen) {
      cur = line;
      continue;
    }
    // 한 줄이 너무 긴 경우 강제 분할
    let i = 0;
    while (i < line.length) {
      out.push(line.slice(i, i + maxLen));
      i += maxLen;
    }
    cur = '';
  }
  if (cur) out.push(cur);
  return out.length ? out : [''];
}

function splitLongFenceBlock(block: string, maxLen: number): string[] {
  const m = block.match(/^```([^\n]*)\n([\s\S]*?)```$/);
  if (!m) return chunkText(block, maxLen);

  const lang = m[1] ?? '';
  const body = m[2] ?? '';
  const open = `\`\`\`${lang}\n`;
  const close = `\n\`\`\``;
  const maxBodyLen = Math.max(1, maxLen - open.length - close.length);

  const parts = chunkText(body, maxBodyLen);
  return parts.map((p) => `${open}${p}${close}`);
}

function splitBodyPreservingFences(text: string, maxLen: number): string[] {
  if (!text) return [];

  const segments: string[] = [];
  const re = /```[a-zA-Z0-9_-]*\n?[\s\S]*?```/g;
  let last = 0;
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segments.push(text.slice(last, m.index));
    segments.push(m[0]);
    last = m.index + m[0].length;
  }
  if (last < text.length) segments.push(text.slice(last));

  const flattened: string[] = [];
  for (const seg of segments) {
    if (!seg) continue;
    if (seg.startsWith('```') && seg.endsWith('```')) {
      if (seg.length <= maxLen) flattened.push(seg);
      else flattened.push(...splitLongFenceBlock(seg, maxLen));
    } else {
      if (seg.length <= maxLen) flattened.push(seg);
      else flattened.push(...chunkText(seg, maxLen));
    }
  }

  const out: string[] = [];
  let cur = '';
  for (const seg of flattened) {
    if (!cur) {
      cur = seg;
      continue;
    }
    if (cur.length + seg.length <= maxLen) {
      cur += seg;
      continue;
    }
    out.push(cur);
    cur = seg;
  }
  if (cur) out.push(cur);
  return out;
}

@Injectable()
export class DiceCommands {
  constructor(
    private readonly diceService: DiceService,
    private readonly goldService: GoldService,
    private readonly diceSearchService: DiceSearchService,
  ) {}

  @SlashCommand({
    name: 'r',
    description: 'Roll dice using standard dice notation (e.g., ((2d6+3)*2)',
    guilds: BOT_GUILDS,
  })
  public async roll(
    @Context() [interaction]: SlashCommandContext,
    @Options() dto: DiceExprDTO,
  ) {
    try {
      const r = this.diceService.rollExpression(dto.expr, { sort: dto.sort });
      return interaction.reply({
        content: this.diceService.formatResult(r),
      });
    } catch (err: any) {
      return interaction.reply({
        content: this.goldService.StringFormatter(
          `🚫 잘못된 요청 형식: ${err.message}`,
          TextColor.BOLD_RED,
          true,
          true,
        ),
      });
    }
  }

  @SlashCommand({
    name: 'mchance',
    description: 'Analyze chance that an expression meets a target',
    guilds: BOT_GUILDS,
  })
  public async chance(
    @Context() [interaction]: SlashCommandContext,
    @Options() dto: DiceExprTargetDTO,
  ) {
    try {
      const expr = dto.expr.trim();
      const cmp = (dto.cmp ?? '>=').trim();

      if (!expr) throw new BadRequestException('수식은 비어 있으면 안 돼요.');
      if (!Number.isFinite(dto.target))
        throw new BadRequestException('target은 숫자여야 해요.');
      if (!CMP_SET.has(cmp))
        throw new BadRequestException(
          'cmp는 다음 중 하나여야 해요: >=, >, <=, <, ==, !=',
        );

      // 계산 길어질 수 있어 defer 추천
      await interaction.deferReply();

      const a = this.diceService.analyzeTarget(expr, dto.target, {
        comparator: cmp as any,
        samples: dto.samples,
      });

      const line1 = `🎲 분석 대상: ${expr} ${a.comparator} ${a.target}`;
      const line2 =
        `🤔 확률: ${a.probabilityPercent} (${a.method}` +
        (a.samples ? `, n=${a.samples}` : '') +
        (a.ci95Percent
          ? `, 95% CI ${a.ci95Percent.low}–${a.ci95Percent.high}`
          : '') +
        `)`;

      return interaction.editReply({
        content:
          this.goldService.StringFormatter(
            `${line1}\n`,
            TextColor.BOLD_BLUE,
            true,
            false,
          ) +
          this.goldService.StringFormatter(
            `${line2}`,
            TextColor.BOLD_WHITE,
            false,
            true,
          ),
      });
    } catch (err: any) {
      return interaction.reply({
        content: this.goldService.StringFormatter(
          `🚫 잘못된 요청 형식: ${err.message}`,
          TextColor.BOLD_RED,
          true,
          true,
        ),
      });
    }
  }

  @SlashCommand({
    name: 'sspell',
    description: '주문 제목 통합 검색 (Top 1)',
    guilds: BOT_GUILDS,
  })
  public async searchSpell(
    @Context() [interaction]: SlashCommandContext,
    @Options() dto: SearchTitleDTO,
  ) {
    return this.searchByScope(interaction, 'spell', dto.keyword);
  }

  @SlashCommand({
    name: 'sspell-category',
    description: '주문 레벨/학파로 주문명 목록 검색',
    guilds: BOT_GUILDS,
  })
  public async searchSpellCategory(
    @Context() [interaction]: SlashCommandContext,
    @Options() dto: SearchSpellCategoryDTO,
  ) {
    try {
      const level = (dto.level ?? '').trim();
      const school = (dto.school ?? '').trim();
      const learn = (dto.learn ?? '').trim();
      if (!level || !school) {
        return interaction.reply({
          content: this.goldService.StringFormatter(
            '🚫 level, school은 비어 있을 수 없습니다.',
            TextColor.BOLD_RED,
            true,
            true,
          ),
        });
      }

      await interaction.deferReply();

      if (!this.diceSearchService.hasConfiguredChannels('spell')) {
        return interaction.editReply({
          content: this.goldService.StringFormatter(
            `🚫 검색 채널 환경변수가 비어 있습니다. (${SEARCH_ENV_HINT})`,
            TextColor.BOLD_RED,
            true,
            true,
          ),
        });
      }

      if (this.diceSearchService.getSyncedAt() === 0) {
        await this.diceSearchService.syncAll();
      }

      const names = await this.diceSearchService.searchSpellNamesByCategory(
        level,
        school,
        learn,
      );
      if (!names.length) {
        const learnText = learn ? `, 습득: ${learn}` : '';
        return interaction.editReply({
          content: this.goldService.StringFormatter(
            `🔎 검색 결과 없음 (레벨: ${level}, 학파: ${school}${learnText})`,
            TextColor.BOLD_YELLOW,
            true,
            true,
          ),
        });
      }

      const listBody = names.join('\n');
      const title = `${level} / ${school}${learn ? ` / ${learn}` : ''} 주문 목록 (${names.length})`;
      const chunks = chunkText(listBody, DISCORD_MSG_LIMIT - 120);
      const messages: string[] = [];
      for (let i = 0; i < chunks.length; i += 1) {
        const body = i === 0 ? `${title}\n\n${chunks[i] ?? ''}` : chunks[i];
        messages.push(`\`\`\`\n${body}\n\`\`\``);
      }

      await interaction.editReply({ content: messages[0] });
      for (let i = 1; i < messages.length; i += 1) {
        await interaction.followUp({ content: messages[i] });
      }
      return;
    } catch (err: any) {
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply({
          content: this.goldService.StringFormatter(
            `🚫 검색 실패: ${err?.message ?? err}`,
            TextColor.BOLD_RED,
            true,
            true,
          ),
        });
      }
      return interaction.reply({
        content: this.goldService.StringFormatter(
          `🚫 검색 실패: ${err?.message ?? err}`,
          TextColor.BOLD_RED,
          true,
          true,
        ),
      });
    }
  }

  @SlashCommand({
    name: 'sskill',
    description: '기술 제목 통합 검색 (Top 1)',
    guilds: BOT_GUILDS,
  })
  public async searchSkill(
    @Context() [interaction]: SlashCommandContext,
    @Options() dto: SearchTitleDTO,
  ) {
    return this.searchByScope(interaction, 'skill', dto.keyword);
  }

  @SlashCommand({
    name: 'ssync',
    description: '주문/기술 검색 인덱스 동기화',
    guilds: BOT_GUILDS,
  })
  public async syncSearchIndex(@Context() [interaction]: SlashCommandContext) {
    if (!SSYNC_ALLOWED.has(interaction.user.id)) {
      await interaction.reply({
        content: this.goldService.StringFormatter(
          `🚫 커맨드를 사용할 권한이 없습니다.\n 사용자 ID: ${interaction.user.id}`,
          TextColor.BOLD_RED,
          true,
          true,
        ),
        flags: 'Ephemeral',
      });
      return;
    }

    try {
      await interaction.deferReply();
      if (!this.diceSearchService.hasConfiguredChannels('all')) {
        return interaction.editReply({
          content: this.goldService.StringFormatter(
            `🚫 검색 채널 환경변수가 비어 있습니다. (${SEARCH_ENV_HINT})`,
            TextColor.BOLD_RED,
            true,
            true,
          ),
        });
      }

      const result = await this.diceSearchService.syncAll();
      const at = new Date(result.syncedAt).toLocaleString('ko-KR');
      return interaction.editReply({
        content: this.goldService.StringFormatter(
          `✅ 검색 동기화 완료\n주문: ${result.spells}개\n기술: ${result.skills}개\n시각: ${at}`,
          TextColor.BOLD_GREEN,
          true,
          true,
        ),
      });
    } catch (err: any) {
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply({
          content: this.goldService.StringFormatter(
            `🚫 동기화 실패: ${err?.message ?? err}`,
            TextColor.BOLD_RED,
            true,
            true,
          ),
        });
      }
      return interaction.reply({
        content: this.goldService.StringFormatter(
          `🚫 동기화 실패: ${err?.message ?? err}`,
          TextColor.BOLD_RED,
          true,
          true,
        ),
      });
    }
  }

  @SlashCommand({
    name: 'ssdiag',
    description: '주문/기술 검색 채널 권한/접근 진단',
    guilds: BOT_GUILDS,
  })
  public async diagnoseSearch(@Context() [interaction]: SlashCommandContext) {
    if (!ALLOWED.has(interaction.user.id)) {
      await interaction.reply({
        content: this.goldService.StringFormatter(
          `🚫 커맨드를 사용할 권한이 없습니다.\n 사용자 ID: ${interaction.user.id}`,
          TextColor.BOLD_RED,
          true,
          true,
        ),
        flags: 'Ephemeral',
      });
      return;
    }

    try {
      await interaction.deferReply({ flags: 'Ephemeral' });
      const rows = await this.diceSearchService.diagnoseConfiguredChannels();
      if (!rows.length) {
        return interaction.editReply({
          content: this.goldService.StringFormatter(
            `🚫 진단 대상 채널이 없습니다. (${SEARCH_ENV_HINT})`,
            TextColor.BOLD_RED,
            true,
            true,
          ),
        });
      }

      const lines: string[] = [];
      lines.push('[ssdiag]');
      for (const r of rows) {
        lines.push(
          `- ${r.scope.toUpperCase()} ${r.channelName} (${r.channelId})`,
        );
        lines.push(
          `  fetch:${r.fetchOk} type:${r.channelType} view:${r.canView} readHistory:${r.canReadHistory} send:${r.canSend}`,
        );
        lines.push(
          `  messageFetch:${r.sampleFetchOk} sampleCount:${r.sampleMessageCount} threads:${r.threadCount}`,
        );
        if (r.warnings.length) {
          for (const w of r.warnings) lines.push(`  warn: ${w}`);
        }
      }
      const text = lines.join('\n');

      if (text.length <= DISCORD_MSG_LIMIT) {
        return interaction.editReply({ content: `\`\`\`\n${text}\n\`\`\`` });
      }

      const chunks = chunkText(text, DISCORD_MSG_LIMIT - 10);
      await interaction.editReply({ content: `\`\`\`\n${chunks[0]}\n\`\`\`` });
      for (let i = 1; i < chunks.length; i += 1) {
        await interaction.followUp({
          content: `\`\`\`\n${chunks[i]}\n\`\`\``,
          flags: 'Ephemeral',
        });
      }
      return;
    } catch (err: any) {
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply({
          content: this.goldService.StringFormatter(
            `🚫 진단 실패: ${err?.message ?? err}`,
            TextColor.BOLD_RED,
            true,
            true,
          ),
        });
      }
      return interaction.reply({
        content: this.goldService.StringFormatter(
          `🚫 진단 실패: ${err?.message ?? err}`,
          TextColor.BOLD_RED,
          true,
          true,
        ),
        flags: 'Ephemeral',
      });
    }
  }

  private async searchByScope(
    interaction: SlashCommandContext[0],
    scope: 'spell' | 'skill',
    keywordRaw: string,
  ) {
    try {
      const keyword = (keywordRaw ?? '').trim();
      if (!keyword) {
        return interaction.reply({
          content: this.goldService.StringFormatter(
            '🚫 keyword는 비어 있을 수 없습니다.',
            TextColor.BOLD_RED,
            true,
            true,
          ),
        });
      }

      await interaction.deferReply();

      if (!this.diceSearchService.hasConfiguredChannels(scope)) {
        return interaction.editReply({
          content: this.goldService.StringFormatter(
            `🚫 검색 채널 환경변수가 비어 있습니다. (${SEARCH_ENV_HINT})`,
            TextColor.BOLD_RED,
            true,
            true,
          ),
        });
      }

      if (this.diceSearchService.getSyncedAt() === 0) {
        await this.diceSearchService.syncAll();
      }

      let match = null as Awaited<
        ReturnType<DiceSearchService['searchTop']>
      >;
      if (scope === 'spell') {
        const lvNo = keyword.match(/^\s*(\d+)\.(\d+)\s*$/);
        if (lvNo) {
          const level = Number.parseInt(lvNo[1], 10);
          const number = Number.parseInt(lvNo[2], 10);
          match = await this.diceSearchService.searchSpellByLevelAndNumber(
            level,
            number,
          );
        }
      }
      if (!match) {
        match = await this.diceSearchService.searchTop(scope, keyword);
      }
      if (!match) {
        return interaction.editReply({
          content: this.goldService.StringFormatter(
            `🔎 검색 결과 없음 (${scope === 'spell' ? '주문' : '기술'})`,
            TextColor.BOLD_YELLOW,
            true,
            true,
          ),
        });
      }

      const doc = match.doc;
      const header = `${doc.messageUrl}\n\n**\`\`\`\n${doc.title}\n\`\`\`**\n`;
      const bodyChunks = splitBodyPreservingFences(doc.body ?? '', DISCORD_MSG_LIMIT);

      const messages: string[] = [];
      let firstMsg = header;

      if (bodyChunks.length > 0) {
        const candidate = `${firstMsg}${bodyChunks[0]}`;
        if (candidate.length <= DISCORD_MSG_LIMIT) {
          firstMsg = candidate;
          bodyChunks.shift();
        }
      }

      messages.push(firstMsg);
      messages.push(...bodyChunks);

      await interaction.editReply({ content: messages[0] });
      for (let i = 1; i < messages.length; i += 1) {
        await interaction.followUp({
          content: messages[i],
        });
      }
      return;
    } catch (err: any) {
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply({
          content: this.goldService.StringFormatter(
            `🚫 검색 실패: ${err?.message ?? err}`,
            TextColor.BOLD_RED,
            true,
            true,
          ),
        });
      }
      return interaction.reply({
        content: this.goldService.StringFormatter(
          `🚫 검색 실패: ${err?.message ?? err}`,
          TextColor.BOLD_RED,
          true,
          true,
        ),
      });
    }
  }
}
