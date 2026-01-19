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
import { UnitPresetsService } from './unit-presets.service';
import type {
  CreateUnitPresetDto,
  CreateUnitPresetFolderDto,
  UpdateUnitPresetDto,
  UpdateUnitPresetFolderDto,
  ValidateHpFormulaDto,
} from './unit-presets.dto';

@UseGuards(AuthGuard)
@Controller('unit-presets')
export class UnitPresetsController {
  constructor(private readonly presets: UnitPresetsService) {}

  @Get()
  async list(@Req() req: AuthRequest) {
    return this.presets.list(req.user.id);
  }

  @Post('folders')
  async createFolder(
    @Req() req: AuthRequest,
    @Body() body: CreateUnitPresetFolderDto,
  ) {
    return this.presets.createFolder(req.user.id, body ?? {});
  }

  @Patch('folders/:id')
  async updateFolder(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: UpdateUnitPresetFolderDto,
  ) {
    return this.presets.updateFolder(req.user.id, id, body ?? {});
  }

  @Delete('folders/:id')
  async deleteFolder(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.presets.deleteFolder(req.user.id, id);
  }

  @Post()
  async createPreset(
    @Req() req: AuthRequest,
    @Body() body: CreateUnitPresetDto,
  ) {
    return this.presets.createPreset(req.user.id, body ?? {});
  }

  @Post('validate-hp-formula')
  async validateHpFormula(@Body() body: ValidateHpFormulaDto) {
    return this.presets.validateHpFormula(body ?? {});
  }

  @Patch(':id')
  async updatePreset(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: UpdateUnitPresetDto,
  ) {
    return this.presets.updatePreset(req.user.id, id, body ?? {});
  }

  @Delete(':id')
  async deletePreset(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.presets.deletePreset(req.user.id, id);
  }
}
