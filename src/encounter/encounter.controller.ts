//src/encounter/encounter.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
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
  channelId: string; // "<#123...>"도 허용
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

  @Post(':id/actions')
  async actions(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: Action | Action[],
  ) {
    return this.encounter.apply(req.user.id, id, body);
  }

  // (옵션) 프론트에서 "내가 보내려는 ANSI" 미리보기 용
  @Get(':id/render')
  async render(@Req() req: AuthRequest, @Param('id') id: string) {
    const state = await this.encounter.get(req.user.id, id);
    return { ansi: this.encounter.render(state) };
  }

  @Post(':id/publish')
  async publish(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: PublishBody,
  ) {
    const channelId = sanitizeChannelId(body?.channelId);
    if (!channelId) {
      throw new BadRequestException('channelId가 필요합니다.');
    }

    const state = await this.encounter.get(req.user.id, id);
    const ansi = this.encounter.render(state);

    await this.publisher.sendAnsiToChannel(channelId, ansi); // ✅ 항상 새 메시지
    return { ok: true, channelId };
  }

  // undo: 마지막 apply(요청 1번) 되돌리기
  @Post(':id/undo')
  async undo(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.encounter.undo(req.user.id, id);
  }
}

function sanitizeChannelId(input?: string): string {
  const s = (input ?? '').trim();
  if (!s) return '';
  // <#1234567890> 또는 그냥 숫자 ID 모두 처리
  const digits = s.replace(/\D/g, '');
  return digits;
}
