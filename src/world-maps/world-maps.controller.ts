import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AuthGuard } from '../auth/auth.guard';
import type { AuthRequest } from '../auth/auth.types';
import { WorldMapsService } from './world-maps.service';
import type {
  BuildingExecutionRule,
  BuildingPlacementRule,
  BuildingPreset,
  CityGlobalState,
  HexOrientation,
  MapTileStateAssignment,
  MapTileStatePreset,
  MapTileRegionState,
  UpkeepPopulationId,
  ResourceId,
} from './world-maps.types';

type CreateWorldMapBody = {
  name?: string;
};

type UpdateWorldMapBody = {
  name?: string;
  imageWidth?: number | null;
  imageHeight?: number | null;
  hexSize?: number;
  originX?: number;
  originY?: number;
  cols?: number;
  rows?: number;
  orientation?: HexOrientation;
  cityGlobal?: CityGlobalState;
  tileStatePresets?: MapTileStatePreset[];
  tileStateAssignments?: Record<string, MapTileStateAssignment[]>;
  tileRegionStates?: Record<string, MapTileRegionState>;
  buildingPresets?: BuildingPreset[];
};

type UpsertBuildingPresetBody = {
  name?: string;
  color?: string;
  tier?: string;
  effort?: number | null;
  space?: number | null;
  description?: string | null;
  placementRules?: BuildingPlacementRule[] | null;
  buildCost?: Partial<Record<ResourceId, number>> | null;
  researchCost?: Partial<Record<ResourceId, number>> | null;
  upkeep?:
    | {
        resources?: Partial<Record<ResourceId, number>>;
        population?: Partial<Record<UpkeepPopulationId, number>>;
      }
    | null;
  effects?:
    | {
        onBuild?: BuildingExecutionRule[];
        daily?: BuildingExecutionRule[];
        onRemove?: BuildingExecutionRule[];
      }
    | null;
};

type CreateBuildingInstanceBody = {
  presetId?: string;
  col?: number;
  row?: number;
  enabled?: boolean;
  progressEffort?: number;
  meta?: Record<string, unknown>;
};

type UpdateBuildingInstanceBody = {
  enabled?: boolean;
  progressEffort?: number;
  meta?: Record<string, unknown> | null;
};

type AppendWorldMapTickLogBody = {
  day?: number;
  summary?: Record<string, unknown>;
};

type RunWorldMapDailyBody = {
  days?: number;
};

type UploadedImageFile = {
  buffer: Buffer;
  mimetype?: string;
  originalname?: string;
};

@Controller('world-maps')
@UseGuards(AuthGuard)
export class WorldMapsController {
  constructor(private readonly worldMaps: WorldMapsService) {}

  @Get()
  list(@Req() req: AuthRequest) {
    return this.worldMaps.list(req.user);
  }

  @Get(':id')
  get(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.worldMaps.getById(req.user, id);
  }

  @Post()
  create(@Req() req: AuthRequest, @Body() body: CreateWorldMapBody) {
    return this.worldMaps.create(req.user, body?.name ?? '');
  }

  @Patch(':id')
  update(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: UpdateWorldMapBody,
  ) {
    return this.worldMaps.update(req.user, id, body);
  }

  @Post(':id/image')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  uploadImage(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @UploadedFile() file: UploadedImageFile,
  ) {
    return this.worldMaps.replaceImage(req.user, id, file);
  }

  @Delete(':id')
  remove(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.worldMaps.remove(req.user, id);
  }

  @Get(':id/building-presets')
  listBuildingPresets(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.worldMaps.listBuildingPresets(req.user, id);
  }

  @Post(':id/building-presets')
  createBuildingPreset(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: UpsertBuildingPresetBody,
  ) {
    return this.worldMaps.createBuildingPreset(req.user, id, body);
  }

  @Patch(':id/building-presets/:presetId')
  updateBuildingPreset(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('presetId') presetId: string,
    @Body() body: UpsertBuildingPresetBody,
  ) {
    return this.worldMaps.updateBuildingPreset(req.user, id, presetId, body);
  }

  @Delete(':id/building-presets/:presetId')
  deleteBuildingPreset(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('presetId') presetId: string,
  ) {
    return this.worldMaps.deleteBuildingPreset(req.user, id, presetId);
  }

  @Get(':id/buildings')
  listBuildingInstances(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.worldMaps.listBuildingInstances(req.user, id);
  }

  @Post(':id/buildings')
  createBuildingInstance(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: CreateBuildingInstanceBody,
  ) {
    return this.worldMaps.createBuildingInstance(req.user, id, body);
  }

  @Patch(':id/buildings/:instanceId')
  updateBuildingInstance(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('instanceId') instanceId: string,
    @Body() body: UpdateBuildingInstanceBody,
  ) {
    return this.worldMaps.updateBuildingInstance(req.user, id, instanceId, body);
  }

  @Delete(':id/buildings/:instanceId')
  deleteBuildingInstance(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('instanceId') instanceId: string,
  ) {
    return this.worldMaps.deleteBuildingInstance(req.user, id, instanceId);
  }

  @Get(':id/tick-logs')
  listTickLogs(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    const parsed = Number(limit ?? '');
    return this.worldMaps.listTickLogs(
      req.user,
      id,
      Number.isFinite(parsed) ? Math.trunc(parsed) : undefined,
    );
  }

  @Post(':id/tick-logs')
  appendTickLog(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: AppendWorldMapTickLogBody,
  ) {
    return this.worldMaps.appendTickLog(req.user, id, body);
  }

  @Post(':id/run-daily')
  runDaily(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: RunWorldMapDailyBody,
  ) {
    return this.worldMaps.runDaily(req.user, id, body?.days);
  }
}

