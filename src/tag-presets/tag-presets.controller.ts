import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import type { AuthRequest } from '../auth/auth.types';
import { TagPresetsService } from './tag-presets.service';
import type {
  CreateTagPresetDto,
  CreateTagPresetFolderDto,
  UpdateTagPresetDto,
  UpdateTagPresetFolderDto,
} from './tag-presets.dto';

@UseGuards(AuthGuard)
@Controller('tag-presets')
export class TagPresetsController {
  constructor(private readonly presets: TagPresetsService) {}

  @Get()
  async list(@Req() req: AuthRequest) {
    return this.presets.list(req.user.id);
  }

  @Post('folders')
  async createFolder(
    @Req() req: AuthRequest,
    @Body() body: CreateTagPresetFolderDto,
  ) {
    return this.presets.createFolder(req.user.id, body ?? {});
  }

  @Patch('folders/:id')
  async updateFolder(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: UpdateTagPresetFolderDto,
  ) {
    return this.presets.updateFolder(req.user.id, id, body ?? {});
  }

  @Delete('folders/:id')
  async deleteFolder(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.presets.deleteFolder(req.user.id, id);
  }

  @Post()
  async create(@Req() req: AuthRequest, @Body() body: CreateTagPresetDto) {
    return this.presets.create(req.user.id, body ?? {});
  }

  @Patch(':id')
  async update(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: UpdateTagPresetDto,
  ) {
    return this.presets.update(req.user.id, id, body ?? {});
  }

  @Delete(':id')
  async delete(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.presets.delete(req.user.id, id);
  }
}
