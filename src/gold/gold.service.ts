import { Injectable, Logger } from '@nestjs/common';
import { Context, On, Once } from 'necord';
import type { ContextOf } from 'necord';
import { Client } from 'discord.js';
import { CharacterGoldDTO } from './CharacterGold-dto';
import { PrismaClient } from '@prisma/client';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { CharacterInfoDTO } from './CharacterInfo-dto';
import { CharacterNameDTO } from './CharacterName-dto';
import {
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { CharacterGoldTransactionDTO } from './CharacterGoldTransaction-dto';

export enum TextColor {
  BOLD_WHITE = 'bold_white',
  BOLD_YELLOW = 'bold_yellow',
  BOLD_GRAY = 'bold_gray',
  BOLD_RED = 'bold_red',
  BOLD_GREEN = 'bold_green',
  BOLD_PINK = 'bold_pink',
  BOLD_BLUE = 'bold_blue',
  BOLD_LIME = 'bold_lime',
  NONE = 'none',
}

export class GoldInfo {
  name: string;
  gold: number;
  daily_expense: number;
  isNpc: boolean;
  friend: string | null;
}

export class ExpenseResult {
  name: string;
  prevGold: number;
  curGold: number;
  prevDay: number;
  curDay: number;
  dailyExpense: number;
}

export class GiveGoldResult {
  fromName: string;
  toName: string;
  fromPrevGold: number;
  fromCurGold: number;
  toPrevGold: number;
  toCurGold: number;
  amount: number;
}

@Injectable()
export class GoldService {
  private readonly logger = new Logger(GoldService.name);
  constructor(private prisma: PrismaClient) {}

  public async Register(characterInfoDTO: CharacterInfoDTO) {
    const name = characterInfoDTO.character.trim();
    let friendName = '';
    if (characterInfoDTO.friend) {
      friendName = characterInfoDTO.friend.trim();
    }

    try {
      await this.prisma.characterGold.create({
        data: {
          name,
          gold: 0,
          dailyExpense: 0,
          isNpc: characterInfoDTO.isNpc,
          friend: characterInfoDTO.isNpc ? friendName : null,
        },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new ConflictException(`Character "${name}" already exists`);
      }
      this.logger.error(
        `Failed to register character "${name}": ${err?.message ?? err}`,
      );
      throw err;
    }
  }

  public async SetGold(payload: CharacterGoldDTO) {
    const name = payload.character.trim();
    try {
      await this.prisma.characterGold.update({
        where: { name },
        data: { gold: payload.change },
      });
    } catch (err: any) {
      if (err?.code === 'P2025') {
        this.logger.warn(`Character not found: ${name}`);
        throw new NotFoundException(`Character "${name}" not found`);
      }
      this.logger.error(
        `Failed to set gold for "${name}": ${err?.message ?? err}`,
      );
      throw err;
    }
  }

  public async EarnGold(payload: CharacterGoldDTO): Promise<number> {
    const name = payload.character.trim();
    try {
      await this.prisma.characterGold.update({
        where: { name },
        data: {
          gold: { increment: payload.change },
        },
      });
    } catch (err: any) {
      if (err?.code === 'P2025') {
        this.logger.warn(`Character not found: ${name}`);
        throw new NotFoundException(`Character "${name}" not found`);
      }
      this.logger.error(
        `Failed to earn gold for "${name}": ${err?.message ?? err}`,
      );
      throw err;
    }

    const row = await this.prisma.characterGold.findUnique({
      where: { name },
      select: { gold: true },
    });

    if (!row) {
      this.logger.warn(`Character not found: ${name}`);
      throw new NotFoundException(`Character "${name}" not found`);
    }

    return row.gold;
  }

  public async SpendGold(payload: CharacterGoldDTO): Promise<number> {
    const name = payload.character.trim();
    try {
      await this.prisma.characterGold.update({
        where: { name },
        data: {
          gold: { decrement: payload.change },
        },
      });
    } catch (err: any) {
      if (err?.code === 'P2025') {
        this.logger.warn(`Character not found: ${name}`);
        throw new NotFoundException(`Character "${name}" not found`);
      }
      this.logger.error(
        `Failed to spend gold for "${name}": ${err?.message ?? err}`,
      );
      throw err;
    }

    const row = await this.prisma.characterGold.findUnique({
      where: { name },
      select: { gold: true },
    });

    if (!row) {
      this.logger.warn(`Character not found: ${name}`);
      throw new NotFoundException(`Character "${name}" not found`);
    }

    return row.gold;
  }

  public async GetGold(payload: CharacterGoldDTO): Promise<number> {
    const name = payload.character.trim();
    const row = await this.prisma.characterGold.findUnique({
      where: { name },
      select: { gold: true },
    });

    if (!row) {
      this.logger.warn(`Character not found: ${name}`);
      throw new NotFoundException(`Character "${name}" not found`);
    }

    return row.gold;
  }

  public async GetGoldParty(payload: CharacterGoldDTO) {
    const name = payload.character.trim();

    const rows = await this.prisma.characterGold.findMany({
      where: {
        OR: [{ name }, { friend: name }],
      },
      orderBy: [{ isNpc: 'asc' }, { name: 'asc' }],
    });

    if (!rows || rows.length === 0) {
      this.logger.warn(`Character or friend not found: ${name}`);
      throw new NotFoundException(
        `No character or friend matching "${name}" found`,
      );
    }

    return rows;
  }

  public async DeleteCharacter(payload: CharacterNameDTO): Promise<void> {
    const name = payload.character.trim();

    try {
      await this.prisma.characterGold.delete({
        where: { name },
      });
    } catch (err: any) {
      if (err?.code === 'P2025') {
        this.logger.warn(`Character not found: ${name}`);
        throw new NotFoundException(`Character "${name}" not found`);
      }
      this.logger.error(
        `DeleteCharacter error for "${name}": ${err?.message ?? err}`,
      );
      throw new InternalServerErrorException('Failed to delete character');
    }
  }

  public async SetDay(payload: CharacterGoldDTO): Promise<void> {
    const name = payload.character.trim();

    try {
      await this.prisma.characterGold.update({
        where: { name },
        data: { day: payload.change },
      });
    } catch (err: any) {
      if (err?.code === 'P2025') {
        this.logger.warn(`Character not found: ${name}`);
        throw new NotFoundException(`Character "${name}" not found`);
      }
      this.logger.error(`SetDay error for "${name}": ${err?.message ?? err}`);
      throw new InternalServerErrorException('Failed to set day');
    }
  }

  public async DaySync(payload: CharacterNameDTO): Promise<number | null> {
    const name = payload.character.trim();
    const row = await this.prisma.characterGold.findUnique({
      where: { name },
      select: { day: true },
    });

    if (!row) {
      this.logger.warn(`Character not found: ${name}`);
      throw new NotFoundException(`Character "${name}" not found`);
    }

    const { count } = await this.prisma.characterGold.updateMany({
      where: {
        OR: [{ name }, { friend: name }],
      },
      data: {
        day: row.day,
      },
    });

    if (count === 0) {
      this.logger.warn(`No rows to update for "${name}"`);
    }

    return row.day;
  }

  public async SetExpense(payload: CharacterGoldDTO): Promise<void> {
    const name = payload.character.trim();

    try {
      await this.prisma.characterGold.update({
        where: { name },
        data: { dailyExpense: payload.change },
      });
    } catch (err: any) {
      if (err?.code === 'P2025') {
        this.logger.warn(`Character not found: ${name}`);
        throw new NotFoundException(`Character "${name}" not found`);
      }
      this.logger.error(
        `SetExpense error for "${name}": ${err?.message ?? err}`,
      );
      throw new InternalServerErrorException('Failed to set daily expense');
    }
  }

  public async DayPass(payload: CharacterNameDTO): Promise<ExpenseResult> {
    const name = payload.character.trim();

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const prev = await tx.characterGold.findUnique({
          where: { name },
          select: { name: true, gold: true, day: true, dailyExpense: true },
        });

        if (!prev) {
          this.logger.warn(`Character not found: ${name}`);
          throw new NotFoundException(`Character "${name}" not found`);
        }

        const updated = await tx.characterGold.update({
          where: { name },
          data: {
            day: { increment: 1 },
            gold: { decrement: prev.dailyExpense },
          },
          select: { gold: true, day: true },
        });

        const res: ExpenseResult = {
          name: prev.name,
          prevGold: prev.gold,
          curGold: updated.gold,
          prevDay: prev.day || -1,
          curDay: updated.day || -1,
          dailyExpense: prev.dailyExpense,
        };
        return res;
      });

      return result;
    } catch (err: any) {
      if (err instanceof NotFoundException) throw err;
      if (err?.code === 'P2025') {
        this.logger.warn(`Character not found: ${name}`);
        throw new NotFoundException(`Character "${name}" not found`);
      }
      this.logger.error(`DayPass error for "${name}": ${err?.message ?? err}`);
      throw new InternalServerErrorException('Failed to pass a day');
    }
  }

  public async DayPassParty(
    payload: CharacterNameDTO,
  ): Promise<ExpenseResult[]> {
    const name = payload.character.trim();

    try {
      const results = await this.prisma.$transaction(async (tx) => {
        const targets = await tx.characterGold.findMany({
          where: { OR: [{ name }, { friend: name }] },
          select: {
            id: true,
            name: true,
            gold: true,
            day: true,
            dailyExpense: true,
          },
          orderBy: [{ isNpc: 'asc' }, { name: 'asc' }],
        });

        if (targets.length === 0) {
          throw new NotFoundException(
            `No character or friend matching "${name}" found`,
          );
        }

        const updates = await Promise.all(
          targets.map((prev) =>
            tx.characterGold.update({
              where: { id: prev.id },
              data: {
                day: { increment: 1 },
                gold: { decrement: prev.dailyExpense },
              },
              select: { gold: true, day: true },
            }),
          ),
        );

        const res: ExpenseResult[] = targets.map((prev, i) => ({
          name: prev.name,
          prevGold: prev.gold,
          curGold: updates[i].gold,
          prevDay: prev.day ?? -1,
          curDay: updates[i].day ?? -1,
          dailyExpense: prev.dailyExpense,
        }));

        return res;
      });

      return results;
    } catch (err: any) {
      if (err instanceof NotFoundException) throw err;
      if (err?.code === 'P2025') {
        // (동시 삭제 등으로 업데이트 실패)
        throw new NotFoundException(
          `Some characters were not found while updating "${name}"`,
        );
      }
      this.logger.error(
        `DayPassParty error for "${name}": ${err?.message ?? err}`,
      );
      throw new InternalServerErrorException(
        'Failed to pass a day for the party',
      );
    }
  }

  public async GiveGold(
    payload: CharacterGoldTransactionDTO,
  ): Promise<GiveGoldResult> {
    const fromName = payload.from.trim();
    const toName = payload.to.trim();
    const amount = Math.floor(payload.amount ?? 0);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('amount must be a positive integer');
    }
    if (fromName === toName) {
      throw new BadRequestException('cannot transfer to the same character');
    }

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const [fromRow, toRow] = await Promise.all([
          tx.characterGold.findUnique({
            where: { name: fromName },
            select: { id: true, name: true, gold: true },
          }),
          tx.characterGold.findUnique({
            where: { name: toName },
            select: { id: true, name: true, gold: true },
          }),
        ]);

        if (!fromRow)
          throw new NotFoundException(`Character "${fromName}" not found`);
        if (!toRow)
          throw new NotFoundException(`Character "${toName}" not found`);

        const debit = await tx.characterGold.updateMany({
          where: { id: fromRow.id, gold: { gte: amount } },
          data: { gold: { decrement: amount } },
        });
        if (debit.count !== 1) {
          throw new BadRequestException(
            `Insufficient gold: "${fromRow.name}" has ${fromRow.gold}, needs ${amount}`,
          );
        }

        const toUpdated = await tx.characterGold.update({
          where: { id: toRow.id },
          data: { gold: { increment: amount } },
          select: { gold: true },
        });

        const fromAfter = await tx.characterGold.findUnique({
          where: { id: fromRow.id },
          select: { gold: true },
        });

        const res: GiveGoldResult = {
          fromName: fromRow.name,
          toName: toRow.name,
          fromPrevGold: fromRow.gold,
          fromCurGold: fromAfter!.gold,
          toPrevGold: toRow.gold,
          toCurGold: toUpdated.gold,
          amount,
        };
        return res;
      });

      return result;
    } catch (err: any) {
      if (
        err instanceof NotFoundException ||
        err instanceof BadRequestException
      ) {
        throw err;
      }
      if (err?.code === 'P2025') {
        throw new NotFoundException('Character not found during transfer');
      }
      this.logger.error(`GiveGold error: ${err?.message ?? err}`);
      throw new InternalServerErrorException('Failed to transfer gold');
    }
  }

  public StringFormatter(
    sentence: string,
    color: TextColor,
    isHead: Boolean,
    isTail: Boolean,
  ): string {
    let colorParts = '';
    switch (color) {
      case TextColor.BOLD_YELLOW:
        colorParts = '[1;33m';
        break;

      case TextColor.BOLD_RED:
        colorParts = '[1;31m';
        break;

      case TextColor.BOLD_GREEN:
        colorParts = '[1;36m';
        break;

      case TextColor.BOLD_WHITE:
        colorParts = '[1;38m';
        break;

      case TextColor.BOLD_PINK:
        colorParts = '[1;35m';
        break;

      case TextColor.BOLD_BLUE:
        colorParts = '[2;34m';
        break;

      case TextColor.BOLD_LIME:
        colorParts = '[1;32m';
        break;

      case TextColor.BOLD_GRAY:
        colorParts = '[1;30m';
        break;

      case TextColor.NONE:
        colorParts = '';
    }

    let head = '';
    let tail = '';

    if (isHead) head = head = '```ansi\n';
    if (isTail) tail = ' ```';

    let newString = head + colorParts + ' ' + sentence + tail;
    return newString;
  }

  public numberFormatter(value: number): string {
    return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
}
