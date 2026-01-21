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

const CMP_SET = new Set(['>=', '>', '<=', '<', '==', '!=']);

@Injectable()
export class DiceCommands {
  constructor(
    private readonly diceService: DiceService,
    private readonly goldService: GoldService,
  ) {}

  @SlashCommand({
    name: 'r',
    description: 'Roll dice using standard dice notation (e.g., ((2d6+3)*2)',
    guilds: ['1284642997375336592', '1273347630767804539'],
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
    guilds: ['1284642997375336592', '1273347630767804539'],
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
}
