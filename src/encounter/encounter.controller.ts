//src/encounter/encounter.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import type { Action } from './encounter.types';
import { EncounterService } from './encounter.service';
import { EncounterPublisher } from './encounter.publisher';
import { PublishEncounterDTO } from './encounter.dto';

type PublishBody = {
  channelId: string; // "<#123...>"도 허용
};

@Controller('encounters')
export class EncounterController {
  constructor(
    private readonly encounter: EncounterService,
    private readonly publisher: EncounterPublisher,
  ) {}

  @Get(':id')
  async get(@Param('id') id: string) {
    return this.encounter.get(id);
  }

  @Post(':id/actions')
  async actions(@Param('id') id: string, @Body() body: Action | Action[]) {
    return this.encounter.apply(id, body);
  }

  // (옵션) 프론트에서 "내가 보내려는 ANSI" 미리보기 용
  @Get(':id/render')
  async render(@Param('id') id: string) {
    const state = await this.encounter.get(id);
    return { ansi: this.encounter.render(state) };
  }

  @Post(':id/publish')
  async publish(@Param('id') id: string, @Body() body: PublishBody) {
    const channelId = sanitizeChannelId(body?.channelId);
    if (!channelId) {
      throw new BadRequestException('channelId가 필요합니다.');
    }

    const state = await this.encounter.get(id);
    const ansi = this.encounter.render(state);

    await this.publisher.sendAnsiToChannel(channelId, ansi); // ✅ 항상 새 메시지
    return { ok: true, channelId };
  }

  // undo: 마지막 apply(요청 1번) 되돌리기
  @Post(':id/undo')
  async undo(@Param('id') id: string) {
    return this.encounter.undo(id);
  }
}

function sanitizeChannelId(input?: string): string {
  const s = (input ?? '').trim();
  if (!s) return '';
  // <#1234567890> 또는 그냥 숫자 ID 모두 처리
  const digits = s.replace(/\D/g, '');
  return digits;
}
