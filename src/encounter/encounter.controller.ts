//src/encounter/encounter.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Action } from './encounter.types';
import { EncounterService } from './encounter.service';
import { EncounterPublisher } from './encounter.publisher';
import { AuthGuard } from '../auth/auth.guard';
import type { AuthRequest } from '../auth/auth.types';

type PublishBody = {
  channelId: string; // "<#123...>"???�용
  hideBench?: boolean;
  hideBenchTeam?: boolean;
  hideBenchEnemy?: boolean;
};

type CreateEncounterBody = {
  name?: string;
};

@UseGuards(AuthGuard)
@Controller('encounters')
export class EncounterController {
  constructor(
    private readonly encounter: EncounterService,
    private readonly publisher: EncounterPublisher,
  ) {}

  @Get()
  async list(@Req() req: AuthRequest) {
    return this.encounter.list(req.user.id);
  }

  @Post()
  async create(@Req() req: AuthRequest, @Body() body: CreateEncounterBody) {
    return this.encounter.create(req.user.id, body?.name);
  }

  @Get(':id')
  async get(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.encounter.get(req.user.id, id);
  }

  @Delete(':id')
  async remove(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.encounter.remove(req.user.id, id);
  }

  @Post(':id/actions')
  async actions(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: Action | Action[],
  ) {
    return this.encounter.apply(req.user.id, id, body);
  }

  // (?�션) ?�론?�에??"?��? 보내?�는 ANSI" 미리보기 ??  @Get(':id/render')
  async render(@Req() req: AuthRequest, @Param('id') id: string) {
    const state = await this.encounter.get(req.user.id, id);
    return { ansi: await this.encounter.renderForUser(req.user.id, state) };
  }

  @Post(':id/publish')
  async publish(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: PublishBody,
  ) {
    const channelId = sanitizeChannelId(body?.channelId);
    if (!channelId) {
      throw new BadRequestException('channelId가 ?�요?�니??');
    }

    const state = await this.encounter.get(req.user.id, id);
    const hideBench = !!body?.hideBench;
    const hideBenchTeam = hideBench || !!body?.hideBenchTeam;
    const hideBenchEnemy = hideBench || !!body?.hideBenchEnemy;
    const ansi = await this.encounter.renderForUser(req.user.id, state, {
      hideBench,
      hideBenchTeam,
      hideBenchEnemy,
    });

    await this.publisher.sendAnsiToChannel(channelId, ansi); // ????�� ??메시지
    return { ok: true, channelId };
  }

  // undo: 마�?�?apply(?�청 1�? ?�돌리기
  @Post(':id/undo')
  async undo(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.encounter.undo(req.user.id, id);
  }
}

function sanitizeChannelId(input?: string): string {
  const s = (input ?? '').trim();
  if (!s) return '';
  // <#1234567890> ?�는 그냥 ?�자 ID 모두 처리
  const digits = s.replace(/\D/g, '');
  return digits;
}

