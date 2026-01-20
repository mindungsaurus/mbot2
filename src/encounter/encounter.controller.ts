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
  channelId: string; // "<#123...>"???ˆìš©
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

  @Post(':id/actions')
  async actions(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: Action | Action[],
  ) {
    return this.encounter.apply(req.user.id, id, body);
  }

  // (?µì…˜) ?„ë¡ ?¸ì—??"?´ê? ë³´ë‚´?¤ëŠ” ANSI" ë¯¸ë¦¬ë³´ê¸° ??  @Get(':id/render')
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
      throw new BadRequestException('channelIdê°€ ?„ìš”?©ë‹ˆ??');
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

    await this.publisher.sendAnsiToChannel(channelId, ansi); // ????ƒ ??ë©”ì‹œì§€
    return { ok: true, channelId };
  }

  // undo: ë§ˆì?ë§?apply(?”ì²­ 1ë²? ?˜ëŒë¦¬ê¸°
  @Post(':id/undo')
  async undo(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.encounter.undo(req.user.id, id);
  }
}

function sanitizeChannelId(input?: string): string {
  const s = (input ?? '').trim();
  if (!s) return '';
  // <#1234567890> ?ëŠ” ê·¸ëƒ¥ ?«ì ID ëª¨ë‘ ì²˜ë¦¬
  const digits = s.replace(/\D/g, '');
  return digits;
}

