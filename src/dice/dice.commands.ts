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
import { ALLOWED } from 'src/gold/gold.commands';

const CMP_SET = new Set(['>=', '>', '<=', '<', '==', '!=']);
const SEARCH_ENV_HINT = 'SSPELL_CHANNEL_IDS, SSKILL_CHANNEL_IDS';
const BOT_GUILDS = ['1284642997375336592', '1273347630767804539'];
const DISCORD_MSG_LIMIT = 1900;

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

      const match = await this.diceSearchService.searchTop(scope, keyword);
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
      const lang = scope === 'spell' ? 'ini' : 'cs';

      const head =
        `${doc.messageUrl}\n\n` + `**\`\`\`\n${doc.title}\n\`\`\`**\n`;
      const codeOpen = `\`\`\`${lang}\n`;
      const codeClose = `\n\`\`\``;

      const firstBodyMax = Math.max(
        1,
        DISCORD_MSG_LIMIT - head.length - codeOpen.length - codeClose.length,
      );
      const nextBodyMax = Math.max(
        1,
        DISCORD_MSG_LIMIT - `(계속 99)\n`.length - codeOpen.length - codeClose.length,
      );

      const chunks = chunkText(doc.body ?? '', nextBodyMax);
      const first = chunks[0] ?? '';
      const rest = chunks.slice(1);

      await interaction.editReply({
        content: `${head}${codeOpen}${first.slice(0, firstBodyMax)}${codeClose}`,
      });

      // 첫 청크가 firstBodyMax를 넘긴 경우 남은 부분을 별도 청크로 다시 추가
      const firstRemainder =
        first.length > firstBodyMax ? [first.slice(firstBodyMax)] : [];
      const followChunks = [...firstRemainder, ...rest];

      for (let i = 0; i < followChunks.length; i += 1) {
        const idx = i + 2; // 본문 파트 번호 (첫 메시지가 1)
        const c = followChunks[i] ?? '';
        await interaction.followUp({
          content: `(계속 ${idx})\n${codeOpen}${c}${codeClose}`,
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
