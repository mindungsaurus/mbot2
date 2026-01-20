import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { GoldService } from './gold.service';
import { PrismaClient } from '@prisma/client';
import { AuthGuard } from '../auth/auth.guard';
import { AdminGuard } from '../auth/admin.guard';

@Controller('gold')
export class GoldController {
  constructor(
    private readonly goldService: GoldService,
    private readonly prisma: PrismaClient,
  ) {}

  @Get('characters')
  @UseGuards(AuthGuard)
  async listCharacters() {
    return this.prisma.characterGold.findMany({
      orderBy: [{ isNpc: 'asc' }, { name: 'asc' }],
    });
  }

  @Get('characters/:name')
  @UseGuards(AuthGuard)
  async getCharacter(@Param('name') name: string) {
    const trimmed = (name ?? '').trim();
    if (!trimmed) {
      throw new BadRequestException('character name required');
    }

    const row = await this.prisma.characterGold.findUnique({
      where: { name: trimmed },
    });
    if (!row) {
      throw new NotFoundException(`Character "${trimmed}" not found`);
    }
    return row;
  }

  @Post('characters')
  @UseGuards(AuthGuard, AdminGuard)
  async createCharacter(
    @Body()
    body: {
      name?: string;
      isNpc?: boolean;
      friend?: string | null;
    },
  ) {
    const name = (body?.name ?? '').trim();
    if (!name) {
      throw new BadRequestException('character name required');
    }
    await this.goldService.Register({
      character: name,
      isNpc: !!body?.isNpc,
      friend: body?.friend ?? '',
    });

    return this.prisma.characterGold.findUnique({ where: { name } });
  }

  @Patch('characters/:name')
  @UseGuards(AuthGuard, AdminGuard)
  async updateCharacter(
    @Param('name') name: string,
    @Body()
    body: {
      gold?: number;
      dailyExpense?: number;
      day?: number | null;
      isNpc?: boolean;
      friend?: string | null;
    },
  ) {
    const trimmed = (name ?? '').trim();
    if (!trimmed) {
      throw new BadRequestException('character name required');
    }

    const current = await this.prisma.characterGold.findUnique({
      where: { name: trimmed },
    });
    if (!current) {
      throw new NotFoundException(`Character "${trimmed}" not found`);
    }

    const data: Record<string, any> = {};
    if (body.gold !== undefined) data.gold = Math.trunc(body.gold);
    if (body.dailyExpense !== undefined) {
      data.dailyExpense = Math.trunc(body.dailyExpense);
    }
    if (body.day !== undefined) {
      data.day = body.day === null ? null : Math.trunc(body.day);
    }
    if (body.isNpc !== undefined) data.isNpc = !!body.isNpc;

    const nextIsNpc = body.isNpc !== undefined ? !!body.isNpc : current.isNpc;
    const friendProvided = Object.prototype.hasOwnProperty.call(body, 'friend');

    if (!nextIsNpc && body.isNpc === false) {
      data.friend = null;
    }

    if (friendProvided) {
      let nextFriend = (body.friend ?? '').trim();
      if (!nextFriend) nextFriend = '';
      const normalizedFriend = nextFriend.length > 0 ? nextFriend : null;

      if (normalizedFriend && !nextIsNpc) {
        throw new BadRequestException('friend only allowed for NPC');
      }
      if (normalizedFriend) {
        if (normalizedFriend === trimmed) {
          throw new BadRequestException('friend cannot be self');
        }
        const friendRow = await this.prisma.characterGold.findUnique({
          where: { name: normalizedFriend },
          select: { isNpc: true },
        });
        if (!friendRow) {
          throw new NotFoundException(`Character "${normalizedFriend}" not found`);
        }
        if (friendRow.isNpc) {
          throw new BadRequestException('friend must be a PC');
        }
      }
      data.friend = normalizedFriend;
    } else if (!nextIsNpc && current.friend) {
      data.friend = null;
    }

    if (Object.keys(data).length === 0) {
      return current;
    }

    return this.prisma.characterGold.update({
      where: { name: trimmed },
      data,
    });
  }

  @Delete('characters/:name')
  @UseGuards(AuthGuard, AdminGuard)
  async deleteCharacter(@Param('name') name: string) {
    const trimmed = (name ?? '').trim();
    if (!trimmed) {
      throw new BadRequestException('character name required');
    }
    await this.goldService.DeleteCharacter({ character: trimmed });
    return { ok: true };
  }
}
