import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { extname, join } from 'node:path';
import type { AuthUser } from '../auth/auth.types';
import type {
  BuildingExecutionRule,
  BuildingRulePredicate,
  BuildingPreset,
  BuildingPresetLine,
  BuildingPlacementRule,
  BuildingRuleAction,
  BuildingResourceId,
  CityGlobalState,
  CityPopulationState,
  HexOrientation,
  MapTileStateAssignment,
  MapTileStatePreset,
  MapTileRegionState,
  PopulationId,
  PopulationTrackedId,
  UpkeepPopulationId,
  PublicWorldMap,
  ResourceId,
  CappedResourceId,
  WorldMapBuildingInstanceRow,
  WorldMapBuildingPresetRow,
  WorldMapTickLogRow,
} from './world-maps.types';

type UploadedImageFile = {
  buffer: Buffer;
  mimetype?: string;
  originalname?: string;
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
  buildCost?: Partial<Record<BuildingResourceId, number>> | null;
  researchCost?: Partial<Record<BuildingResourceId, number>> | null;
  upkeep?:
    | {
        resources?: Partial<Record<BuildingResourceId, number>>;
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

type RuntimeInstance = WorldMapBuildingInstanceRow & {
  preset?: WorldMapBuildingPresetRow;
};

type OverflowConversionTracker = {
  convertedGold: number;
  details: Partial<Record<CappedResourceId, { overflowAmount: number; goldGain: number }>>;
  beforeGold: number | null;
  afterGold: number | null;
};

type RuntimeContext = {
  origin: RuntimeInstance;
  cityGlobal: CityGlobalState;
  tileStates: Record<string, MapTileStateAssignment[]>;
  tileRegions: Record<string, MapTileRegionState>;
  instances: RuntimeInstance[];
  orientation: HexOrientation;
  cols: number;
  rows: number;
  overflowTracker?: OverflowConversionTracker;
};

type PredicateEvalResult = {
  matched: boolean;
  repeatCount: number;
  reason?: string;
};

type RuleExecutionStatus = 'applied' | 'skipped' | 'failed';
type RuleExecutionLog = {
  instanceId: string;
  presetId: string;
  presetName: string;
  event: 'onBuild' | 'onRemove' | 'daily';
  ruleId: string;
  status: RuleExecutionStatus;
  reason?: string;
  repeatCount?: number;
  actionsApplied?: number;
};

type BuildRuntimeStatus = 'building' | 'active';

const DEFAULT_HEX_SIZE = 64;
const DEFAULT_ORIGIN_X = 0;
const DEFAULT_ORIGIN_Y = 0;
const DEFAULT_COLS = 30;
const DEFAULT_ROWS = 30;
const DEFAULT_ORIENTATION: HexOrientation = 'pointy';
const RESOURCE_IDS: ResourceId[] = [
  'wood',
  'stone',
  'fabric',
  'weave',
  'food',
  'research',
  'order',
  'gold',
];
const CAPPED_RESOURCE_IDS: ResourceId[] = ['wood', 'stone', 'fabric', 'weave', 'food'];
const CAPPED_RESOURCE_SET = new Set<ResourceId>(CAPPED_RESOURCE_IDS);
const RESOURCE_LABELS: Record<ResourceId, string> = {
  wood: '나무',
  stone: '석재',
  fabric: '직물',
  weave: '위브',
  food: '식량',
  research: '연구',
  order: '질서',
  gold: '금',
};
const POPULATION_LABELS: Record<UpkeepPopulationId, string> = {
  settlers: '정착민',
  engineers: '기술자',
  scholars: '학자',
  laborers: '역꾼',
  elderly: '노약자',
  anyNonElderly: '노약자를 제외한 아무나',
};
const POPULATION_IDS: PopulationId[] = [
  'settlers',
  'engineers',
  'scholars',
  'laborers',
  'elderly',
];
const UPKEEP_POPULATION_IDS: UpkeepPopulationId[] = [
  'settlers',
  'engineers',
  'scholars',
  'laborers',
  'elderly',
  'anyNonElderly',
];
const TRACKED_WORKER_POPULATION_IDS: PopulationTrackedId[] = [
  'settlers',
  'engineers',
  'scholars',
  'laborers',
];

const DEFAULT_CITY_GLOBAL: CityGlobalState = {
  values: {
    wood: 0,
    stone: 0,
    fabric: 0,
    weave: 0,
    food: 0,
    research: 0,
    order: 0,
    gold: 0,
  },
  caps: {
    wood: 100,
    stone: 100,
    fabric: 100,
    weave: 100,
    food: 100,
  },
  overflowToGold: {
    wood: 0,
    stone: 0,
    fabric: 0,
    weave: 0,
    food: 0,
  },
  warehouse: {},
  day: 0,
  satisfaction: 0,
  populationCap: 0,
  population: {
    settlers: { total: 0, available: 0 },
    engineers: { total: 0, available: 0 },
    scholars: { total: 0, available: 0 },
    laborers: { total: 0, available: 0 },
    elderly: { total: 0, available: 0 },
  },
};

@Injectable()
export class WorldMapsService implements OnModuleInit {
  private readonly logger = new Logger(WorldMapsService.name);
  private readonly rootDir = join(process.cwd(), 'data', 'world-maps');
  private readonly assetDir = join(this.rootDir, 'assets');
  private readonly legacyMetaPath = join(this.rootDir, 'maps.json');

  constructor(private readonly prisma: PrismaClient) {
    this.ensureStorage();
  }

  async onModuleInit() {
    await this.migrateLegacyJsonIfNeeded();
  }

  async list(user: AuthUser): Promise<PublicWorldMap[]> {
    const rows = await this.prisma.worldMap.findMany({
      where: user.isAdmin ? {} : { ownerId: user.id },
      orderBy: { name: 'asc' },
    });
    return rows.map((row) => this.toPublic(row));
  }

  async getById(user: AuthUser, id: string): Promise<PublicWorldMap> {
    const row = await this.requireReadable(user, id);
    return this.toPublic(row);
  }

  async create(user: AuthUser, name: string): Promise<PublicWorldMap> {
    const trimmed = name.trim();
    if (!trimmed) throw new BadRequestException('map name required');

    const row = await this.prisma.worldMap.create({
      data: {
        ownerId: user.id,
        name: trimmed,
        imageUrl: null,
        imageWidth: null,
        imageHeight: null,
        hexSize: DEFAULT_HEX_SIZE,
        originX: DEFAULT_ORIGIN_X,
        originY: DEFAULT_ORIGIN_Y,
        cols: DEFAULT_COLS,
        rows: DEFAULT_ROWS,
        orientation: DEFAULT_ORIENTATION,
        cityGlobal: this.normalizeCityGlobalInput(undefined),
        tileStatePresets: [],
        tileStateAssignments: {},
        tileRegionStates: {},
        buildingPresets: [],
      },
    });
    return this.toPublic(row);
  }

  async update(
    user: AuthUser,
    id: string,
    body: UpdateWorldMapBody,
  ): Promise<PublicWorldMap> {
    const current = await this.requireWritable(user, id);
    const data: Record<string, unknown> = {};

    if (body.name !== undefined) {
      const name = String(body.name ?? '').trim();
      if (!name) throw new BadRequestException('map name required');
      data.name = name;
    }
    if (body.imageWidth !== undefined) {
      data.imageWidth =
        body.imageWidth == null
          ? null
          : this.toInt(body.imageWidth, 'imageWidth', 1, 20000);
    }
    if (body.imageHeight !== undefined) {
      data.imageHeight =
        body.imageHeight == null
          ? null
          : this.toInt(body.imageHeight, 'imageHeight', 1, 20000);
    }
    if (body.hexSize !== undefined) {
      data.hexSize = this.toNumberRange(body.hexSize, 'hexSize', 8, 1000);
    }
    if (body.originX !== undefined) {
      data.originX = this.toNumber(body.originX, 'originX');
    }
    if (body.originY !== undefined) {
      data.originY = this.toNumber(body.originY, 'originY');
    }
    if (body.cols !== undefined) {
      data.cols = this.toInt(body.cols, 'cols', 1, 500);
    }
    if (body.rows !== undefined) {
      data.rows = this.toInt(body.rows, 'rows', 1, 500);
    }
    if (body.orientation !== undefined) {
      if (body.orientation !== 'pointy' && body.orientation !== 'flat') {
        throw new BadRequestException('invalid orientation');
      }
      data.orientation = body.orientation;
    }
    if (body.cityGlobal !== undefined) {
      data.cityGlobal = this.normalizeCityGlobalInput(body.cityGlobal);
    }
    if (body.tileStatePresets !== undefined) {
      data.tileStatePresets = this.normalizeTilePresetsInput(body.tileStatePresets);
    }
    if (body.tileStateAssignments !== undefined) {
      const referencePresets =
        body.tileStatePresets !== undefined
          ? this.normalizeTilePresetsInput(body.tileStatePresets)
          : this.normalizeTilePresetsInput(current.tileStatePresets);
      data.tileStateAssignments = this.normalizeTileStateAssignmentsInput(
        body.tileStateAssignments,
        referencePresets,
      );
    }
    if (body.tileRegionStates !== undefined) {
      data.tileRegionStates = this.normalizeTileRegionStatesInput(body.tileRegionStates);
    }
    if (body.buildingPresets !== undefined) {
      data.buildingPresets = this.normalizeBuildingPresetsInput(body.buildingPresets);
    }

    const updated = await this.prisma.worldMap.update({
      where: { id },
      data,
    });
    return this.toPublic(updated);
  }

  async replaceImage(
    user: AuthUser,
    id: string,
    file: UploadedImageFile,
  ): Promise<PublicWorldMap> {
    if (!file) throw new BadRequestException('image file required');
    if (!(file.mimetype ?? '').startsWith('image/')) {
      throw new BadRequestException('image file required');
    }

    const current = await this.requireWritable(user, id);
    const safeExt = extname(file.originalname || '').toLowerCase() || '.png';
    const nextFileName = `${id}-${randomUUID()}${safeExt}`;
    const fullPath = join(this.assetDir, nextFileName);
    writeFileSync(fullPath, file.buffer);

    const prevFile = (current.imageUrl ?? '').split('/').pop();
    if (prevFile) {
      const prevPath = join(this.assetDir, prevFile);
      if (existsSync(prevPath)) {
        try {
          unlinkSync(prevPath);
        } catch {
          // ignore stale files
        }
      }
    }

    const updated = await this.prisma.worldMap.update({
      where: { id },
      data: {
        imageUrl: `/uploads/world-maps/${nextFileName}`,
      },
    });
    return this.toPublic(updated);
  }

  async remove(user: AuthUser, id: string) {
    const current = await this.requireWritable(user, id);
    await this.prisma.worldMap.delete({ where: { id } });

    const fileName = (current.imageUrl ?? '').split('/').pop();
    if (fileName) {
      const filePath = join(this.assetDir, fileName);
      if (existsSync(filePath)) {
        try {
          unlinkSync(filePath);
        } catch {
          // ignore
        }
      }
    }

    return { ok: true };
  }

  async listBuildingPresets(user: AuthUser, mapId: string): Promise<WorldMapBuildingPresetRow[]> {
    await this.requireReadable(user, mapId);
    const rows = await this.prisma.worldMapBuildingPreset.findMany({
      where: { mapId },
      orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((row) => this.toBuildingPresetRow(row));
  }

  async createBuildingPreset(
    user: AuthUser,
    mapId: string,
    body: UpsertBuildingPresetBody,
  ): Promise<WorldMapBuildingPresetRow> {
    await this.requireWritable(user, mapId);
    const name = String(body?.name ?? '').trim();
    if (!name) throw new BadRequestException('building preset name required');
    const row = await this.prisma.worldMapBuildingPreset.create({
      data: {
        mapId,
        name,
        color: this.normalizeHexColor(body?.color, '#eab308'),
        tier: String(body?.tier ?? '').trim() || null,
        effort: this.toNullableIntMin(body?.effort, 0),
        space: this.toNullableIntMin(body?.space, 0),
        description: String(body?.description ?? '').trim() || null,
        placementRules: this.normalizePlacementRulesInput(body?.placementRules),
        buildCost: this.normalizeResourceCostsInput(body?.buildCost),
        researchCost: this.normalizeResourceCostsInput(body?.researchCost),
        upkeep: this.normalizeUpkeepInput(body?.upkeep),
        effects: this.normalizeEffectsInput(body?.effects),
      },
    });
    return this.toBuildingPresetRow(row);
  }

  async updateBuildingPreset(
    user: AuthUser,
    mapId: string,
    presetId: string,
    body: UpsertBuildingPresetBody,
  ): Promise<WorldMapBuildingPresetRow> {
    await this.requireWritable(user, mapId);
    const current = await this.prisma.worldMapBuildingPreset.findUnique({
      where: { id: presetId },
    });
    if (!current || current.mapId !== mapId) {
      throw new NotFoundException('building preset not found');
    }
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) {
      const name = String(body.name ?? '').trim();
      if (!name) throw new BadRequestException('building preset name required');
      data.name = name;
    }
    if (body.color !== undefined) data.color = this.normalizeHexColor(body.color, '#eab308');
    if (body.tier !== undefined) data.tier = String(body.tier ?? '').trim() || null;
    if (body.effort !== undefined) data.effort = this.toNullableIntMin(body.effort, 0);
    if (body.space !== undefined) data.space = this.toNullableIntMin(body.space, 0);
    if (body.description !== undefined) {
      data.description = String(body.description ?? '').trim() || null;
    }
    if (body.placementRules !== undefined) {
      data.placementRules = this.normalizePlacementRulesInput(body.placementRules);
    }
    if (body.buildCost !== undefined) {
      data.buildCost = this.normalizeResourceCostsInput(body.buildCost);
    }
    if (body.researchCost !== undefined) {
      data.researchCost = this.normalizeResourceCostsInput(body.researchCost);
    }
    if (body.upkeep !== undefined) {
      data.upkeep = this.normalizeUpkeepInput(body.upkeep);
    }
    if (body.effects !== undefined) {
      data.effects = this.normalizeEffectsInput(body.effects);
    }
    const row = await this.prisma.worldMapBuildingPreset.update({
      where: { id: presetId },
      data,
    });
    return this.toBuildingPresetRow(row);
  }

  async deleteBuildingPreset(user: AuthUser, mapId: string, presetId: string) {
    await this.requireWritable(user, mapId);
    const current = await this.prisma.worldMapBuildingPreset.findUnique({
      where: { id: presetId },
      select: { id: true, mapId: true },
    });
    if (!current || current.mapId !== mapId) {
      throw new NotFoundException('building preset not found');
    }
    await this.prisma.worldMapBuildingPreset.delete({ where: { id: presetId } });
    return { ok: true };
  }

  async listBuildingInstances(
    user: AuthUser,
    mapId: string,
  ): Promise<WorldMapBuildingInstanceRow[]> {
    await this.requireReadable(user, mapId);
    const rows = await this.prisma.worldMapBuildingInstance.findMany({
      where: { mapId },
      orderBy: [{ row: 'asc' }, { col: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((row) => this.toBuildingInstanceRow(row));
  }

  async createBuildingInstance(
    user: AuthUser,
    mapId: string,
    body: CreateBuildingInstanceBody,
  ): Promise<WorldMapBuildingInstanceRow & { buildSummary?: { spent: Array<{ resourceId: BuildingResourceId; label: string; amount: number }>; spaceAdded: number } }> {
    const map = await this.requireWritable(user, mapId);
    const presetId = String(body?.presetId ?? '').trim();
    if (!presetId) throw new BadRequestException('presetId required');
    const preset = await this.prisma.worldMapBuildingPreset.findUnique({ where: { id: presetId } });
    if (!preset || preset.mapId !== map.id) {
      throw new BadRequestException('invalid presetId');
    }
    const col = this.toInt(body?.col, 'col', 0, Math.max(0, map.cols - 1));
    const tileRow = this.toInt(body?.row, 'row', 0, Math.max(0, map.rows - 1));
    const normalizedPreset = this.toBuildingPresetRow(preset);
    const placementFailureReasons = await this.getPlacementFailureReasons(
      map,
      normalizedPreset,
      col,
      tileRow,
    );
    if (placementFailureReasons.length > 0) {
      throw new BadRequestException(
        `배치 조건 불충족: ${placementFailureReasons.join(' / ')}`,
      );
    }

    const cityGlobal = this.normalizeCityGlobalInput(map.cityGlobal);
    const tileRegionStates = this.normalizeTileRegionStatesInput(map.tileRegionStates);
    const buildCost = normalizedPreset.buildCost ?? {};
    const spent: Array<{ resourceId: BuildingResourceId; label: string; amount: number }> = [];
    const lacking: string[] = [];
    for (const [resourceIdRaw, costRaw] of Object.entries(buildCost)) {
      const resourceId = this.normalizeBuildingResourceId(resourceIdRaw);
      if (!resourceId) continue;
      const cost = Math.max(0, Math.trunc(Number(costRaw) || 0));
      if (cost <= 0) continue;
      const current = this.getBuildingResourceAmount(cityGlobal, resourceId);
      if (current < cost) {
        lacking.push(`${this.getBuildingResourceLabel(resourceId)}(${current}/${cost})`);
      }
    }
    if (lacking.length > 0) {
      throw new BadRequestException(
        `건설 비용 부족: ${lacking.join(', ')}`,
      );
    }
    for (const [resourceIdRaw, costRaw] of Object.entries(buildCost)) {
      const resourceId = this.normalizeBuildingResourceId(resourceIdRaw);
      if (!resourceId) continue;
      const cost = Math.max(0, Math.trunc(Number(costRaw) || 0));
      if (cost <= 0) continue;
      const current = this.getBuildingResourceAmount(cityGlobal, resourceId);
      this.setBuildingResourceAmount(cityGlobal, resourceId, Math.max(0, current - cost));
      spent.push({ resourceId, label: this.getBuildingResourceLabel(resourceId), amount: cost });
    }

    const presetSpace = Math.max(0, Math.trunc(Number(normalizedPreset.space ?? 0)));
    if (presetSpace > 0) {
      const key = this.tileKey(col, tileRow);
      const current = (tileRegionStates[key] ?? {}) as MapTileRegionState;
      const spaceUsed = Math.max(0, Math.trunc(Number(current.spaceUsed ?? 0)));
      const spaceCap = Math.max(0, Math.trunc(Number(current.spaceCap ?? 0)));
      if (spaceCap > 0 && spaceUsed + presetSpace > spaceCap) {
        throw new BadRequestException(
          `공간 부족: 현재 ${spaceUsed}/${spaceCap}, 필요 ${presetSpace}`,
        );
      }
      tileRegionStates[key] = {
        ...current,
        spaceUsed: spaceUsed + presetSpace,
      };
    }

    const requestedProgress = this.toInt(body?.progressEffort ?? 0, 'progressEffort', 0, 1_000_000);
    const requiredEffort = Math.max(0, Math.trunc(Number(normalizedPreset.effort ?? 0)));
    const willActivateImmediately = requiredEffort <= 0 || requestedProgress >= requiredEffort;
    const assignedWorkersByType = this.extractAssignedWorkersByTypeFromMeta(body?.meta);
    const assignedWorkers = this.sumAssignedWorkersByType(assignedWorkersByType);
    const shouldReserveWorkers =
      (body?.enabled !== undefined ? !!body.enabled : true) && !willActivateImmediately;
    if (shouldReserveWorkers && assignedWorkers > 0) {
      if (!this.canReserveWorkersByType(cityGlobal.population, assignedWorkersByType)) {
        const lacks = TRACKED_WORKER_POPULATION_IDS.map((id) => {
          const req = Math.max(0, assignedWorkersByType[id] ?? 0);
          if (req <= 0) return null;
          const cur = Math.max(0, Math.trunc(Number(cityGlobal.population[id]?.available ?? 0) || 0));
          if (cur >= req) return null;
          return `${POPULATION_LABELS[id]}(${cur}/${req})`;
        }).filter(Boolean) as string[];
        throw new BadRequestException(`건설 투입 인원 부족: ${lacks.join(', ')}`);
      }
      this.reserveWorkersByType(cityGlobal.population, assignedWorkersByType);
    }
    const initialMeta = this.withBuildMeta(
      this.toPlainRecord(body?.meta),
      willActivateImmediately ? 'active' : 'building',
      assignedWorkers,
      assignedWorkersByType,
    );

    const instanceRow = await this.prisma.worldMapBuildingInstance.create({
      data: {
        mapId,
        presetId,
        col,
        row: tileRow,
        enabled: body?.enabled !== undefined ? !!body.enabled : true,
        progressEffort: requestedProgress,
        meta: initialMeta as Prisma.InputJsonValue,
      },
    });
    await this.prisma.worldMap.update({
      where: { id: mapId },
      data: {
        cityGlobal: cityGlobal as unknown as Prisma.InputJsonValue,
        tileRegionStates: tileRegionStates as unknown as Prisma.InputJsonValue,
      },
    });
    if (willActivateImmediately) {
      await this.applyBuildingEventEffects(map.id, 'onBuild', [instanceRow.id]);
    }
    return {
      ...this.toBuildingInstanceRow(instanceRow),
      buildSummary: {
        spent,
        spaceAdded: presetSpace,
      },
    };
  }

  async updateBuildingInstance(
    user: AuthUser,
    mapId: string,
    instanceId: string,
    body: UpdateBuildingInstanceBody,
  ): Promise<WorldMapBuildingInstanceRow> {
    const map = await this.requireWritable(user, mapId);
    const current = await this.prisma.worldMapBuildingInstance.findUnique({
      where: { id: instanceId },
    });
    if (!current || current.mapId !== mapId) {
      throw new NotFoundException('building instance not found');
    }
    const preset = await this.prisma.worldMapBuildingPreset.findUnique({
      where: { id: current.presetId },
    });
    const normalizedPreset = preset ? this.toBuildingPresetRow(preset) : undefined;
    const requiredEffort = Math.max(0, Math.trunc(Number(normalizedPreset?.effort ?? 0)));
    const readCurrentStatus = this.readBuildStatusFromMeta(current.meta);
    const currentStatus: BuildRuntimeStatus =
      requiredEffort <= 0
        ? 'active'
        : readCurrentStatus ?? (current.progressEffort >= requiredEffort ? 'active' : 'building');

    const nextEnabled = body.enabled !== undefined ? !!body.enabled : current.enabled;
    const nextProgress =
      body.progressEffort !== undefined
        ? this.toInt(body.progressEffort, 'progressEffort', 0, 1_000_000)
        : current.progressEffort;
    const inputMeta =
      body.meta !== undefined ? this.toPlainRecord(body.meta) : this.toPlainRecord(current.meta);
    const nextWorkersByType = this.extractAssignedWorkersByTypeFromMeta(inputMeta);
    const nextWorkers = this.sumAssignedWorkersByType(nextWorkersByType);
    const nextStatus: BuildRuntimeStatus =
      requiredEffort <= 0 || nextProgress >= requiredEffort ? 'active' : 'building';
    const nextMeta = this.withBuildMeta(inputMeta, nextStatus, nextWorkers, nextWorkersByType);

    const emptyWorkers: Record<PopulationTrackedId, number> = {
      settlers: 0,
      engineers: 0,
      scholars: 0,
      laborers: 0,
    };
    const currentWorkersByType = this.extractAssignedWorkersByTypeFromMeta(current.meta);
    const reservedBefore =
      current.enabled && currentStatus === 'building' ? currentWorkersByType : emptyWorkers;
    const reservedAfter =
      nextEnabled && nextStatus === 'building' ? nextWorkersByType : emptyWorkers;

    const cityGlobal = this.normalizeCityGlobalInput(map.cityGlobal);
    this.releaseWorkersByType(cityGlobal.population, reservedBefore);
    if (!this.canReserveWorkersByType(cityGlobal.population, reservedAfter)) {
      const lacks = TRACKED_WORKER_POPULATION_IDS.map((id) => {
        const req = Math.max(0, reservedAfter[id] ?? 0);
        if (req <= 0) return null;
        const cur = Math.max(0, Math.trunc(Number(cityGlobal.population[id]?.available ?? 0) || 0));
        if (cur >= req) return null;
        return `${POPULATION_LABELS[id]}(${cur}/${req})`;
      }).filter(Boolean) as string[];
      throw new BadRequestException(`건설 투입 인원 부족: ${lacks.join(', ')}`);
    }
    this.reserveWorkersByType(cityGlobal.population, reservedAfter);

    const data: Prisma.WorldMapBuildingInstanceUpdateInput = {
      enabled: nextEnabled,
      progressEffort: nextProgress,
      meta: nextMeta as Prisma.InputJsonValue,
    };
    const [row] = await this.prisma.$transaction([
      this.prisma.worldMapBuildingInstance.update({
        where: { id: instanceId },
        data,
      }),
      this.prisma.worldMap.update({
        where: { id: mapId },
        data: {
          cityGlobal: cityGlobal as unknown as Prisma.InputJsonValue,
        },
      }),
    ]);
    if (
      currentStatus === 'building' &&
      nextStatus === 'active' &&
      (current.enabled || nextEnabled)
    ) {
      await this.applyBuildingEventEffects(mapId, 'onBuild', [instanceId]);
    }
    return this.toBuildingInstanceRow(row);
  }

  async deleteBuildingInstance(user: AuthUser, mapId: string, instanceId: string) {
    await this.requireWritable(user, mapId);
    const current = await this.prisma.worldMapBuildingInstance.findUnique({
      where: { id: instanceId },
      select: {
        id: true,
        mapId: true,
        col: true,
        row: true,
        presetId: true,
        enabled: true,
        progressEffort: true,
        meta: true,
      },
    });
    if (!current || current.mapId !== mapId) {
      throw new NotFoundException('building instance not found');
    }
    await this.applyBuildingEventEffects(mapId, 'onRemove', [instanceId]);
    await this.prisma.worldMapBuildingInstance.delete({ where: { id: instanceId } });
    let removedSpace = 0;
    const map = await this.prisma.worldMap.findUnique({ where: { id: mapId } });
    if (map) {
      const preset = await this.prisma.worldMapBuildingPreset.findUnique({
        where: { id: current.presetId },
      });
      const normalizedPreset = preset ? this.toBuildingPresetRow(preset) : undefined;
      const presetSpace = Math.max(0, Math.trunc(Number(normalizedPreset?.space ?? 0)));
      removedSpace = presetSpace;
      const requiredEffort = Math.max(0, Math.trunc(Number(normalizedPreset?.effort ?? 0)));
      const statusFromMeta = this.readBuildStatusFromMeta(current.meta);
      const status: BuildRuntimeStatus =
        requiredEffort <= 0
          ? 'active'
          : statusFromMeta ?? (current.progressEffort >= requiredEffort ? 'active' : 'building');
      // 미완공(건설중) 건물 제거 시에는 건설 비용을 환불한다.
      // 완공 건물은 기본적으로 환불하지 않으며, 별도 onRemove 규칙으로만 자원 변화가 난다.
      if (status === 'building' && normalizedPreset?.buildCost) {
        const cityGlobal = this.normalizeCityGlobalInput(map.cityGlobal);
        for (const [resourceIdRaw, costRaw] of Object.entries(normalizedPreset.buildCost)) {
          const resourceId = this.normalizeBuildingResourceId(resourceIdRaw);
          if (!resourceId) continue;
          const cost = Math.max(0, Math.trunc(Number(costRaw) || 0));
          if (cost <= 0) continue;
          const currentValue = this.getBuildingResourceAmount(cityGlobal, resourceId);
          let nextValue = currentValue + cost;
          if (this.isBaseResourceId(resourceId) && CAPPED_RESOURCE_SET.has(resourceId)) {
            const cap = Math.max(
              0,
              Math.trunc(Number(cityGlobal.caps[resourceId as keyof typeof cityGlobal.caps] ?? 0) || 0),
            );
            nextValue = Math.min(cap, nextValue);
          }
          this.setBuildingResourceAmount(cityGlobal, resourceId, Math.max(0, Math.trunc(nextValue)));
        }
        map.cityGlobal = cityGlobal as unknown as Prisma.JsonValue;
      }
      if (current.enabled && status === 'building') {
        const workersByType = this.extractAssignedWorkersByTypeFromMeta(current.meta);
        const cityGlobal = this.normalizeCityGlobalInput(map.cityGlobal);
        this.releaseWorkersByType(cityGlobal.population, workersByType);
        map.cityGlobal = cityGlobal as unknown as Prisma.JsonValue;
      }
      if (presetSpace > 0) {
        const key = this.tileKey(current.col, current.row);
        const tileRegionStates = this.normalizeTileRegionStatesInput(map.tileRegionStates);
        const prev = tileRegionStates[key] ?? {};
        const prevUsed = Math.max(0, Math.trunc(Number(prev.spaceUsed ?? 0)));
        tileRegionStates[key] = { ...prev, spaceUsed: Math.max(0, prevUsed - presetSpace) };
        await this.prisma.worldMap.update({
          where: { id: mapId },
          data: {
            cityGlobal:
              (this.normalizeCityGlobalInput(map.cityGlobal) as unknown as Prisma.InputJsonValue),
            tileRegionStates: tileRegionStates as unknown as Prisma.InputJsonValue,
          },
        });
      } else {
        await this.prisma.worldMap.update({
          where: { id: mapId },
          data: {
            cityGlobal:
              (this.normalizeCityGlobalInput(map.cityGlobal) as unknown as Prisma.InputJsonValue),
          },
        });
      }
    }
    return { ok: true, removedSpace };
  }

  async listTickLogs(user: AuthUser, mapId: string, limit = 30): Promise<WorldMapTickLogRow[]> {
    await this.requireReadable(user, mapId);
    const safeLimit = Math.max(1, Math.min(200, Math.trunc(Number(limit) || 30)));
    const rows = await this.prisma.worldMapTickLog.findMany({
      where: { mapId },
      orderBy: { createdAt: 'desc' },
      take: safeLimit,
    });
    return rows.map((row) => this.toTickLogRow(row));
  }

  async appendTickLog(
    user: AuthUser,
    mapId: string,
    body: AppendWorldMapTickLogBody,
  ): Promise<WorldMapTickLogRow> {
    await this.requireWritable(user, mapId);
    const row = await this.prisma.worldMapTickLog.create({
      data: {
        mapId,
        day: this.toInt(body?.day ?? 0, 'day', 0, 1_000_000),
        summary: (this.toPlainRecord(body?.summary) ?? {}) as Prisma.InputJsonValue,
      },
    });
    return this.toTickLogRow(row);
  }

  async runDaily(user: AuthUser, mapId: string, daysInput?: number) {
    await this.requireWritable(user, mapId);
    const days = this.toInt(daysInput ?? 1, 'days', 1, 365);
    let summary = {
      days: 0,
      appliedRules: 0,
      appliedActions: 0,
      failedRules: 0,
      day: 0,
      logs: [] as RuleExecutionLog[],
      overflowConvertedGold: 0,
      overflowBeforeGold: null as number | null,
      overflowAfterGold: null as number | null,
      overflowDetails: {} as Partial<
        Record<CappedResourceId, { overflowAmount: number; goldGain: number }>
      >,
    };
    for (let i = 0; i < days; i += 1) {
      const iter = await this.applyBuildingEventEffects(mapId, 'daily', undefined, true);
      summary = {
        days: summary.days + 1,
        appliedRules: summary.appliedRules + iter.appliedRules,
        appliedActions: summary.appliedActions + iter.appliedActions,
        failedRules: summary.failedRules + iter.failedRules,
        day: iter.day,
        logs: [...summary.logs, ...iter.logs].slice(-500),
        overflowConvertedGold:
          summary.overflowConvertedGold +
          Math.max(0, Math.trunc(Number(iter.overflowConvertedGold ?? 0) || 0)),
        overflowBeforeGold:
          summary.overflowBeforeGold == null
            ? (iter.overflowBeforeGold ?? null)
            : summary.overflowBeforeGold,
        overflowAfterGold:
          iter.overflowAfterGold != null ? iter.overflowAfterGold : summary.overflowAfterGold,
        overflowDetails: (() => {
          const next = { ...(summary.overflowDetails ?? {}) } as Partial<
            Record<CappedResourceId, { overflowAmount: number; goldGain: number }>
          >;
          const iterDetails = Array.isArray(iter.overflowDetails) ? iter.overflowDetails : [];
          for (const detail of iterDetails) {
            const resourceId = detail?.resourceId as CappedResourceId;
            if (!resourceId || !CAPPED_RESOURCE_SET.has(resourceId as ResourceId)) continue;
            const overflowAmount = Math.max(
              0,
              Math.trunc(Number(detail?.overflowAmount ?? 0) || 0),
            );
            const goldGain = Math.max(0, Math.trunc(Number(detail?.goldGain ?? 0) || 0));
            if (overflowAmount <= 0 || goldGain <= 0) continue;
            const prev = next[resourceId] ?? { overflowAmount: 0, goldGain: 0 };
            next[resourceId] = {
              overflowAmount: prev.overflowAmount + overflowAmount,
              goldGain: prev.goldGain + goldGain,
            };
          }
          return next;
        })(),
      };
    }
    await this.prisma.worldMapTickLog.create({
      data: {
        mapId,
        day: summary.day,
        summary: {
          days: summary.days,
          appliedRules: summary.appliedRules,
          appliedActions: summary.appliedActions,
          failedRules: summary.failedRules,
          day: summary.day,
          logs: summary.logs,
          overflowConvertedGold: summary.overflowConvertedGold,
          overflowBeforeGold: summary.overflowBeforeGold,
          overflowAfterGold: summary.overflowAfterGold,
          overflowDetails: summary.overflowDetails,
        } as unknown as Prisma.InputJsonValue,
      },
    });
    const overflowDetails = (Object.entries(summary.overflowDetails) as Array<
      [CappedResourceId, { overflowAmount: number; goldGain: number }]
    >).map(([resourceId, v]) => ({
      resourceId,
      overflowAmount: Math.max(0, Math.trunc(Number(v?.overflowAmount ?? 0) || 0)),
      goldGain: Math.max(0, Math.trunc(Number(v?.goldGain ?? 0) || 0)),
    }));
    return { ok: true, ...summary, overflowDetails };
  }

  private async applyBuildingEventEffects(
    mapId: string,
    event: 'onBuild' | 'onRemove' | 'daily',
    targetInstanceIds?: string[],
    advanceDay = false,
  ) {
    const mapRow = await this.prisma.worldMap.findUnique({ where: { id: mapId } });
    if (!mapRow) throw new NotFoundException('world map not found');

    const presetRows = await this.prisma.worldMapBuildingPreset.findMany({
      where: { mapId },
    });
    const presetById = new Map(
      presetRows.map((row) => {
        const normalized = this.toBuildingPresetRow(row);
        return [normalized.id, normalized] as const;
      }),
    );
    const instanceRows = await this.prisma.worldMapBuildingInstance.findMany({
      where: { mapId },
      orderBy: [{ row: 'asc' }, { col: 'asc' }, { createdAt: 'asc' }],
    });
    const instances: RuntimeInstance[] = instanceRows.map((row) => {
      const normalized = this.toBuildingInstanceRow(row);
      return { ...normalized, preset: presetById.get(normalized.presetId) };
    });

    let cityGlobal = this.normalizeCityGlobalInput(mapRow.cityGlobal);
    if (advanceDay) cityGlobal.day = Math.max(0, cityGlobal.day + 1);
    let tileStates = this.normalizeTileStateAssignmentsInput(
      mapRow.tileStateAssignments,
      this.normalizeTilePresetsInput(mapRow.tileStatePresets),
    );
    let tileRegions = this.normalizeTileRegionStatesInput(mapRow.tileRegionStates);

    const targetSet = new Set(targetInstanceIds ?? []);

    const runRulesForOrigin = (
      origin: RuntimeInstance,
      eventKind: 'onBuild' | 'onRemove' | 'daily',
      options?: { skipDailyUpkeep?: boolean },
    ) => {
      const effects = origin.preset?.effects;
      if (!effects) return;
      if (!origin.preset) return;
      if (eventKind === 'daily' && !options?.skipDailyUpkeep) {
        const upkeepCheck = this.tryConsumeDailyUpkeep(origin.preset, cityGlobal);
        if (!upkeepCheck.ok) {
          failedRules += 1;
          logs.push({
            instanceId: origin.id,
            presetId: origin.presetId,
            presetName: origin.preset.name,
            event: eventKind,
            ruleId: '__upkeep__',
            status: 'failed',
            reason: upkeepCheck.reasons.join(' / '),
          });
          return;
        }
      }
      const rules =
        eventKind === 'onBuild'
          ? effects.onBuild ?? []
          : eventKind === 'onRemove'
            ? effects.onRemove ?? []
            : effects.daily ?? [];
      if (!Array.isArray(rules) || rules.length === 0) return;

      for (const rule of rules) {
        if (!rule || !Array.isArray(rule.actions) || rule.actions.length === 0) continue;
        if (eventKind === 'daily') {
          const interval = Math.max(1, Math.trunc(Number(rule.intervalDays ?? 1) || 1));
          if (cityGlobal.day % interval !== 0) {
            logs.push({
              instanceId: origin.id,
              presetId: origin.presetId,
              presetName: origin.preset.name,
              event: eventKind,
              ruleId: String(rule.id ?? ''),
              status: 'skipped',
              reason: `intervalDays(${interval}) 미도달`,
            });
            continue;
          }
        }
        const ctx: RuntimeContext = {
          origin,
          cityGlobal,
          tileStates,
          tileRegions,
          instances,
          orientation,
          cols: mapRow.cols,
          rows: mapRow.rows,
          overflowTracker,
        };
        const pred = rule.when
          ? this.evaluateRulePredicateDetailed(rule.when, ctx)
          : ({ matched: true, repeatCount: 1 } satisfies PredicateEvalResult);
        if (!pred.matched) {
          logs.push({
            instanceId: origin.id,
            presetId: origin.presetId,
            presetName: origin.preset.name,
            event: eventKind,
            ruleId: String(rule.id ?? ''),
            status: 'skipped',
            reason: pred.reason ?? '조건 불충족',
          });
          continue;
        }
        const repeatCount = Math.max(1, Math.trunc(Number(pred.repeatCount || 1)));
        appliedRules += 1;
        let ruleAppliedActions = 0;
        for (let repeatIdx = 0; repeatIdx < repeatCount; repeatIdx += 1) {
          for (const action of rule.actions) {
            if (this.applyRuleAction(action, ctx)) {
              appliedActions += 1;
              ruleAppliedActions += 1;
            }
          }
        }
        logs.push({
          instanceId: origin.id,
          presetId: origin.presetId,
          presetName: origin.preset.name,
          event: eventKind,
          ruleId: String(rule.id ?? ''),
          status: 'applied',
          repeatCount,
          actionsApplied: ruleAppliedActions,
          ...(pred.reason ? { reason: pred.reason } : {}),
        });
        cityGlobal = ctx.cityGlobal;
        tileStates = ctx.tileStates;
        tileRegions = ctx.tileRegions;
      }
    };

    const determineStatus = (entry: RuntimeInstance): BuildRuntimeStatus => {
      const requiredEffort = Math.max(0, Math.trunc(Number(entry.preset?.effort ?? 0)));
      if (requiredEffort <= 0) return 'active';
      const metaStatus = this.readBuildStatusFromMeta(entry.meta);
      if (metaStatus === 'active' || metaStatus === 'building') return metaStatus;
      const progress = Math.max(0, Math.trunc(Number(entry.progressEffort ?? 0)));
      return progress >= requiredEffort ? 'active' : 'building';
    };

    const computeAssignedWorkers = (entry: RuntimeInstance) => {
      const assigned = this.extractAssignedWorkersFromMeta(entry.meta);
      return Math.max(0, Math.trunc(Number(assigned) || 0));
    };
    const computeAssignedWorkersByType = (entry: RuntimeInstance) =>
      this.extractAssignedWorkersByTypeFromMeta(entry.meta);

    let appliedRules = 0;
    let appliedActions = 0;
    let failedRules = 0;
    const logs: RuleExecutionLog[] = [];
    const overflowTracker: OverflowConversionTracker = {
      convertedGold: 0,
      details: {},
      beforeGold: null,
      afterGold: null,
    };
    const orientation: HexOrientation = mapRow.orientation === 'flat' ? 'flat' : 'pointy';
    const instancePatchById = new Map<
      string,
      {
        progressEffort?: number;
        meta?: Record<string, unknown>;
      }
    >();
    const activateNow = new Set<string>();

    if (event === 'daily') {
      for (const origin of instances.filter((entry) => entry.enabled)) {
        if (!origin.preset) continue;
        const requiredEffort = Math.max(0, Math.trunc(Number(origin.preset.effort ?? 0)));
        if (requiredEffort <= 0) {
          const workersByType = computeAssignedWorkersByType(origin);
          const nextMeta = this.withBuildMeta(
            origin.meta,
            'active',
            this.sumAssignedWorkersByType(workersByType),
            workersByType,
          );
          if (this.readBuildStatusFromMeta(origin.meta) !== 'active') {
            this.releaseWorkersByType(cityGlobal.population, workersByType);
            instancePatchById.set(origin.id, { meta: nextMeta });
            origin.meta = nextMeta;
            activateNow.add(origin.id);
          }
          continue;
        }

        const status = determineStatus(origin);
        if (status === 'active') {
          const workersByType = computeAssignedWorkersByType(origin);
          const nextMeta = this.withBuildMeta(
            origin.meta,
            'active',
            this.sumAssignedWorkersByType(workersByType),
            workersByType,
          );
          if (this.readBuildStatusFromMeta(origin.meta) !== 'active') {
            this.releaseWorkersByType(cityGlobal.population, workersByType);
            instancePatchById.set(origin.id, {
              ...(instancePatchById.get(origin.id) ?? {}),
              meta: nextMeta,
            });
            origin.meta = nextMeta;
          }
          continue;
        }

        const workersByType = computeAssignedWorkersByType(origin);
        const workers = this.sumAssignedWorkersByType(workersByType);
        if (workers <= 0) {
          logs.push({
            instanceId: origin.id,
            presetId: origin.presetId,
            presetName: origin.preset.name,
            event: 'daily',
            ruleId: '__build_progress__',
            status: 'skipped',
            reason: '투입 인원 미배치',
          });
          continue;
        }
        const prevProgress = Math.max(0, Math.trunc(Number(origin.progressEffort ?? 0)));
        const nextProgress = Math.min(requiredEffort, prevProgress + workers);
        const reached = nextProgress >= requiredEffort;
        const nextMeta = this.withBuildMeta(
          origin.meta,
          reached ? 'active' : 'building',
          workers,
          workersByType,
        );
        instancePatchById.set(origin.id, {
          ...(instancePatchById.get(origin.id) ?? {}),
          progressEffort: nextProgress,
          meta: nextMeta,
        });
        origin.progressEffort = nextProgress;
        origin.meta = nextMeta;
        if (reached) {
          this.releaseWorkersByType(cityGlobal.population, workersByType);
        }
        logs.push({
          instanceId: origin.id,
          presetId: origin.presetId,
          presetName: origin.preset.name,
          event: 'daily',
          ruleId: '__build_progress__',
          status: reached ? 'applied' : 'skipped',
          reason: `건설 진행 ${prevProgress} -> ${nextProgress} / ${requiredEffort} (투입 ${workers})`,
          actionsApplied: workers,
        });
        if (reached) activateNow.add(origin.id);
      }
    }

    const targets =
      event === 'daily'
        ? instances.filter((entry) => entry.enabled && determineStatus(entry) === 'active')
        : instances.filter((entry) => targetSet.has(entry.id));

    for (const origin of targets) {
      runRulesForOrigin(origin, event);
    }

    if (event === 'daily' && activateNow.size > 0) {
      for (const origin of instances.filter((entry) => activateNow.has(entry.id))) {
        runRulesForOrigin(origin, 'onBuild', { skipDailyUpkeep: true });
      }
    }

    if (instancePatchById.size > 0) {
      for (const [instanceId, patch] of instancePatchById.entries()) {
        const data: Prisma.WorldMapBuildingInstanceUpdateInput = {};
        if (patch.progressEffort !== undefined) data.progressEffort = patch.progressEffort;
        if (patch.meta !== undefined) {
          data.meta = (this.toPlainRecord(patch.meta) ?? {}) as Prisma.InputJsonValue;
        }
        if (Object.keys(data).length === 0) continue;
        await this.prisma.worldMapBuildingInstance.update({
          where: { id: instanceId },
          data,
        });
      }
    }

    const normalizedCityGlobal = this.normalizeCityGlobalInput(cityGlobal);
    const normalizedTileStates = this.normalizeTileStateAssignmentsInput(
      tileStates,
      this.normalizeTilePresetsInput(mapRow.tileStatePresets),
    );
    const normalizedTileRegions = this.normalizeTileRegionStatesInput(tileRegions);

    await this.prisma.worldMap.update({
      where: { id: mapId },
      data: {
        cityGlobal: normalizedCityGlobal as unknown as Prisma.InputJsonValue,
        tileStateAssignments: normalizedTileStates as unknown as Prisma.InputJsonValue,
        tileRegionStates: normalizedTileRegions as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      day: normalizedCityGlobal.day,
      appliedRules,
      appliedActions,
      failedRules,
      logs,
      overflowConvertedGold: Math.max(0, Math.trunc(Number(overflowTracker.convertedGold || 0))),
      overflowBeforeGold: overflowTracker.beforeGold,
      overflowAfterGold: overflowTracker.afterGold,
      overflowDetails: (Object.entries(overflowTracker.details) as Array<
        [CappedResourceId, { overflowAmount: number; goldGain: number }]
      >)
        .filter(
          ([, v]) =>
            Math.max(0, Math.trunc(Number(v?.overflowAmount ?? 0) || 0)) > 0 &&
            Math.max(0, Math.trunc(Number(v?.goldGain ?? 0) || 0)) > 0,
        )
        .map(([resourceId, v]) => ({
          resourceId,
          overflowAmount: Math.max(0, Math.trunc(Number(v.overflowAmount ?? 0) || 0)),
          goldGain: Math.max(0, Math.trunc(Number(v.goldGain ?? 0) || 0)),
        })),
    };
  }

  private async getPlacementFailureReasons(
    mapRow: any,
    preset: WorldMapBuildingPresetRow,
    col: number,
    row: number,
  ) {
    const placementRules = Array.isArray(preset.placementRules) ? preset.placementRules : [];
    if (placementRules.length === 0) return [] as string[];
    const presetRows = await this.prisma.worldMapBuildingPreset.findMany({
      where: { mapId: mapRow.id },
    });
    const presetById = new Map(
      presetRows.map((entry) => {
        const normalized = this.toBuildingPresetRow(entry);
        return [normalized.id, normalized] as const;
      }),
    );
    const instanceRows = await this.prisma.worldMapBuildingInstance.findMany({
      where: { mapId: mapRow.id },
      orderBy: [{ row: 'asc' }, { col: 'asc' }, { createdAt: 'asc' }],
    });
    const instances: RuntimeInstance[] = instanceRows.map((entry) => {
      const normalized = this.toBuildingInstanceRow(entry);
      return { ...normalized, preset: presetById.get(normalized.presetId) };
    });
    const prospective: RuntimeInstance = {
      id: '__prospective__',
      mapId: mapRow.id,
      presetId: preset.id,
      col,
      row,
      enabled: true,
      progressEffort: 0,
      meta: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      preset,
    };
    const ctx: RuntimeContext = {
      origin: prospective,
      cityGlobal: this.normalizeCityGlobalInput(mapRow.cityGlobal),
      tileStates: this.normalizeTileStateAssignmentsInput(
        mapRow.tileStateAssignments,
        this.normalizeTilePresetsInput(mapRow.tileStatePresets),
      ),
      tileRegions: this.normalizeTileRegionStatesInput(mapRow.tileRegionStates),
      instances: [...instances, prospective],
      orientation: mapRow.orientation === 'flat' ? 'flat' : 'pointy',
      cols: mapRow.cols,
      rows: mapRow.rows,
    };
    const reasons: string[] = [];
    for (const rule of placementRules) {
      const ok = this.evaluateRulePredicate(rule as BuildingRulePredicate, ctx);
      if (ok) continue;
      reasons.push(this.describePlacementRuleFailure(rule));
    }
    return reasons;
  }

  private describePlacementRuleFailure(rule: BuildingPlacementRule): string {
    if (rule.kind === 'uniquePerTile') {
      return `타일 당 최대 ${Math.max(1, Math.trunc(Number(rule.maxCount ?? 1) || 1))}개 조건 실패`;
    }
    if (rule.kind === 'tileRegionCompare') {
      return `지역 상태 조건 실패(${rule.field} ${rule.op} ${rule.value})`;
    }
    if (rule.kind === 'requireTagInRange') {
      const distance = Math.max(0, Math.trunc(Number(rule.distance ?? 1) || 0));
      const minCount = Math.max(1, Math.trunc(Number(rule.minCount ?? 1) || 1));
      return rule.negate
        ? `거리 ${distance} 내 속성 부정 조건 실패(${rule.tagPresetId})`
        : `거리 ${distance} 내 속성 조건 실패(${rule.tagPresetId}, 최소 ${minCount})`;
    }
    if (rule.kind === 'requireBuildingInRange') {
      const distance = Math.max(0, Math.trunc(Number(rule.distance ?? 1) || 0));
      const minCount = Math.max(1, Math.trunc(Number(rule.minCount ?? 1) || 1));
      return rule.negate
        ? `거리 ${distance} 내 건물 부정 조건 실패(${rule.presetId})`
        : `거리 ${distance} 내 건물 조건 실패(${rule.presetId}, 최소 ${minCount})`;
    }
    if (rule.kind === 'custom') return `사용자 조건 실패(${rule.label})`;
    return '배치 조건 실패';
  }

  private evaluateRulePredicate(predicate: BuildingRulePredicate, ctx: RuntimeContext): boolean {
    return this.evaluateRulePredicateDetailed(predicate, ctx).matched;
  }

  private evaluateRulePredicateDetailed(
    predicate: BuildingRulePredicate,
    ctx: RuntimeContext,
  ): PredicateEvalResult {
    if (!predicate || typeof predicate !== 'object') return { matched: true, repeatCount: 1 };
    if (predicate.kind === 'compare') {
      const left = this.evalRuleExpr(predicate.left, ctx);
      const right = this.evalRuleExpr(predicate.right, ctx);
      return {
        matched: this.compareByOp(left, right, predicate.op),
        repeatCount: 1,
        reason: `수식 비교(${predicate.op})`,
      };
    }
    if (predicate.kind === 'tileRegionCompare') {
      const state = this.getTileRegionState(ctx, ctx.origin.col, ctx.origin.row);
      const left =
        predicate.field === 'spaceRemaining'
          ? Math.max(0, (state.spaceCap ?? 0) - (state.spaceUsed ?? 0))
          : predicate.field === 'pollution'
            ? state.pollution ?? 0
            : predicate.field === 'threat'
              ? state.threat ?? 0
              : state.satisfaction ?? 0;
      return {
        matched: this.compareByOp(left, predicate.value, predicate.op),
        repeatCount: 1,
        reason: `지역 상태 비교(${predicate.field} ${predicate.op} ${predicate.value})`,
      };
    }
    if (predicate.kind === 'hasTag') {
      const count =
        this.countTagsInRange(ctx, predicate.tagId, predicate.scope === 'adjacent' ? 1 : 0) ?? 0;
      return { matched: count > 0, repeatCount: 1, reason: `속성 존재(${predicate.tagId})` };
    }
    if (predicate.kind === 'hasBuilding') {
      const count =
        this.countBuildingsInRange(ctx, predicate.presetId, predicate.scope === 'adjacent' ? 1 : 0) ??
        0;
      return { matched: count > 0, repeatCount: 1, reason: `건물 존재(${predicate.presetId})` };
    }
    if (predicate.kind === 'logic') {
      const rules = Array.isArray(predicate.rules) ? predicate.rules : [];
      if (rules.length === 0) return { matched: true, repeatCount: 1 };
      const children = rules.map((entry) => this.evaluateRulePredicateDetailed(entry, ctx));
      if (predicate.op === 'or') {
        const matchedChildren = children.filter((entry) => entry.matched);
        return {
          matched: matchedChildren.length > 0,
          repeatCount:
            matchedChildren.length > 0
              ? Math.max(1, ...matchedChildren.map((entry) => entry.repeatCount || 1))
              : 1,
          reason: '논리 OR',
        };
      }
      const allMatched = children.every((entry) => entry.matched);
      const repeatSources = children
        .filter((entry) => entry.matched)
        .map((entry) => Math.max(1, entry.repeatCount || 1));
      return {
        matched: allMatched,
        repeatCount: repeatSources.length > 0 ? Math.min(...repeatSources) : 1,
        reason: '논리 AND',
      };
    }
    if (predicate.kind === 'uniquePerTile') {
      const maxCount = Math.max(1, Math.trunc(Number(predicate.maxCount ?? 1) || 1));
      const sameTile = ctx.instances.filter(
        (entry) => entry.enabled && entry.col === ctx.origin.col && entry.row === ctx.origin.row,
      );
      return {
        matched: sameTile.length <= maxCount,
        repeatCount: 1,
        reason: `타일 당 ${maxCount}개 이하`,
      };
    }
    if (predicate.kind === 'requireTagInRange') {
      const distance = Math.max(0, Math.trunc(Number(predicate.distance ?? 1) || 0));
      const minCount = Math.max(1, Math.trunc(Number(predicate.minCount ?? 1) || 1));
      const count = this.countTagsInRange(
        ctx,
        predicate.tagPresetId,
        distance,
        predicate.valueMode,
        predicate.value,
      );
      const totalTiles = this.getTargetTileCountByDistance(ctx, distance);
      const matchedRaw = count >= minCount;
      const matched = predicate.negate ? !matchedRaw : matchedRaw;
      const repeatCount = predicate.repeat
        ? predicate.negate
          ? Math.max(0, totalTiles - count)
          : Math.max(0, count)
        : 1;
      return {
        matched,
        repeatCount: Math.max(1, repeatCount || 1),
        reason: `${predicate.negate ? '부정 ' : ''}거리 내 속성(${predicate.tagPresetId})`,
      };
    }
    if (predicate.kind === 'requireBuildingInRange') {
      const distance = Math.max(0, Math.trunc(Number(predicate.distance ?? 1) || 0));
      const minCount = Math.max(1, Math.trunc(Number(predicate.minCount ?? 1) || 1));
      const count = this.countBuildingsInRange(ctx, predicate.presetId, distance);
      const totalTiles = this.getTargetTileCountByDistance(ctx, distance);
      const matchedRaw = count >= minCount;
      const matched = predicate.negate ? !matchedRaw : matchedRaw;
      const repeatCount = predicate.repeat
        ? predicate.negate
          ? Math.max(0, totalTiles - count)
          : Math.max(0, count)
        : 1;
      return {
        matched,
        repeatCount: Math.max(1, repeatCount || 1),
        reason: `${predicate.negate ? '부정 ' : ''}거리 내 건물(${predicate.presetId})`,
      };
    }
    if (predicate.kind === 'custom') {
      return { matched: true, repeatCount: 1, reason: `사용자 조건(${predicate.label})` };
    }
    return { matched: true, repeatCount: 1 };
  }

  private applyRuleAction(action: BuildingRuleAction, ctx: RuntimeContext): boolean {
    if (!action || typeof action !== 'object') return false;
    if (action.kind === 'adjustResource') {
      const resourceId = this.normalizeBuildingResourceId((action as any).resourceId);
      if (!resourceId) return false;
      const delta = Math.trunc(this.evalRuleExpr(action.delta, ctx));
      const current = this.getBuildingResourceAmount(ctx.cityGlobal, resourceId);
      let next = current + delta;
      if (next < 0) next = 0;
      if (this.isBaseResourceId(resourceId) && CAPPED_RESOURCE_SET.has(resourceId)) {
        const cap = ctx.cityGlobal.caps[resourceId] ?? 0;
        if (next > cap) {
          const overflow = Math.max(0, next - cap);
          next = cap;
          const rate = Math.max(
            0,
            Math.trunc(Number(ctx.cityGlobal.overflowToGold?.[resourceId] ?? 0) || 0),
          );
          if (overflow > 0 && rate > 0) {
            const currentGold = Math.max(
              0,
              Math.trunc(Number(ctx.cityGlobal.values.gold ?? 0) || 0),
            );
            const goldGain = overflow * rate;
            const nextGold = currentGold + goldGain;
            ctx.cityGlobal.values.gold = nextGold;
            const tracker = ctx.overflowTracker;
            if (tracker) {
              if (tracker.beforeGold == null) tracker.beforeGold = currentGold;
              tracker.afterGold = nextGold;
              tracker.convertedGold += goldGain;
              const prev = tracker.details[resourceId] ?? { overflowAmount: 0, goldGain: 0 };
              tracker.details[resourceId] = {
                overflowAmount: prev.overflowAmount + overflow,
                goldGain: prev.goldGain + goldGain,
              };
            }
          }
        }
      }
      this.setBuildingResourceAmount(ctx.cityGlobal, resourceId, next);
      return delta !== 0;
    }
    if (action.kind === 'adjustResourceCap') {
      const delta = Math.trunc(this.evalRuleExpr(action.delta, ctx));
      const current = ctx.cityGlobal.caps[action.resourceId] ?? 0;
      const next = Math.max(0, current + delta);
      ctx.cityGlobal.caps[action.resourceId] = next;
      const value = ctx.cityGlobal.values[action.resourceId] ?? 0;
      if (value > next) ctx.cityGlobal.values[action.resourceId] = next;
      return delta !== 0;
    }
    if (action.kind === 'adjustPopulation') {
      const delta = Math.trunc(this.evalRuleExpr(action.delta, ctx));
      const entry = ctx.cityGlobal.population[action.populationId] ?? { total: 0, available: 0 };
      if (action.field === 'available') {
        const next = Math.max(0, Math.min(entry.total ?? 0, (entry.available ?? 0) + delta));
        entry.available = next;
        ctx.cityGlobal.population[action.populationId] = entry;
        return delta !== 0;
      }
      const currentTotal = Math.max(0, entry.total ?? 0);
      let nextTotal = Math.max(0, currentTotal + delta);
      if (delta > 0) {
        const totalPopulation = this.getTotalPopulation(ctx.cityGlobal.population);
        const room = Math.max(0, ctx.cityGlobal.populationCap - totalPopulation);
        nextTotal = currentTotal + Math.min(delta, room);
      }
      entry.total = nextTotal;
      entry.available = Math.min(nextTotal, Math.max(0, entry.available ?? 0));
      ctx.cityGlobal.population[action.populationId] = entry;
      return delta !== 0;
    }
    if (action.kind === 'adjustPopulationCap') {
      const delta = Math.trunc(this.evalRuleExpr(action.delta, ctx));
      const current = Math.max(0, ctx.cityGlobal.populationCap ?? 0);
      const totalPopulation = this.getTotalPopulation(ctx.cityGlobal.population);
      const next = Math.max(totalPopulation, current + delta);
      ctx.cityGlobal.populationCap = next;
      return delta !== 0;
    }
    if (action.kind === 'convertPopulation') {
      const amount = Math.max(0, Math.trunc(this.evalRuleExpr(action.amount, ctx)));
      if (amount <= 0) return false;
      const from = ctx.cityGlobal.population[action.from] ?? { total: 0, available: 0 };
      const to = ctx.cityGlobal.population[action.to] ?? { total: 0, available: 0 };
      const movable = Math.min(amount, Math.max(0, from.available ?? 0), Math.max(0, from.total ?? 0));
      if (movable <= 0) return false;
      from.total = Math.max(0, (from.total ?? 0) - movable);
      from.available = Math.max(0, (from.available ?? 0) - movable);
      to.total = Math.max(0, (to.total ?? 0) + movable);
      to.available = Math.max(0, (to.available ?? 0) + movable);
      ctx.cityGlobal.population[action.from] = from;
      ctx.cityGlobal.population[action.to] = to;
      return true;
    }
    if (action.kind === 'adjustTileRegion') {
      const delta = Math.trunc(this.evalRuleExpr(action.delta, ctx));
      const targets = this.resolveActionTargetTiles(ctx, action.target, action.distance);
      let changed = false;
      for (const key of targets) {
        const [col, row] = this.parseTileKey(key);
        if (col === null || row === null) continue;
        const current = this.getTileRegionState(ctx, col, row);
        const field = action.field;
        const next = Math.max(0, Math.trunc(Number(current[field] ?? 0) + delta));
        current[field] = next;
        ctx.tileRegions[key] = current;
        changed = changed || delta !== 0;
      }
      return changed;
    }
    if (action.kind === 'addTileState') {
      const targets = this.resolveActionTargetTiles(ctx, action.target, action.distance);
      let changed = false;
      for (const key of targets) {
        const current = Array.isArray(ctx.tileStates[key]) ? [...ctx.tileStates[key]] : [];
        const idx = current.findIndex((entry) => entry.presetId === action.tagPresetId);
        if (idx >= 0) {
          const nextValue = String(action.value ?? '').trim();
          if (nextValue && current[idx].value !== nextValue) {
            current[idx] = { ...current[idx], value: nextValue };
            ctx.tileStates[key] = current;
            changed = true;
          }
          continue;
        }
        current.push({
          presetId: action.tagPresetId,
          ...(String(action.value ?? '').trim() ? { value: String(action.value ?? '').trim() } : {}),
        });
        ctx.tileStates[key] = current;
        changed = true;
      }
      return changed;
    }
    if (action.kind === 'removeTileState') {
      const targets = this.resolveActionTargetTiles(ctx, action.target, action.distance);
      let changed = false;
      for (const key of targets) {
        const current = Array.isArray(ctx.tileStates[key]) ? [...ctx.tileStates[key]] : [];
        const next = current.filter((entry) => entry.presetId !== action.tagPresetId);
        if (next.length !== current.length) {
          if (next.length > 0) ctx.tileStates[key] = next;
          else delete ctx.tileStates[key];
          changed = true;
        }
      }
      return changed;
    }
    return false;
  }

  private evalRuleExpr(expr: any, ctx: RuntimeContext): number {
    if (!expr || typeof expr !== 'object') return 0;
    if (expr.kind === 'const') return Number(expr.value) || 0;
    if (expr.kind === 'resource') {
      const resourceId = this.normalizeBuildingResourceId((expr as any).resourceId);
      if (!resourceId) return 0;
      return this.getBuildingResourceAmount(ctx.cityGlobal, resourceId);
    }
    if (expr.kind === 'population') {
      const entry = ctx.cityGlobal.population?.[expr.populationId as PopulationId];
      if (!entry) return 0;
      if (expr.field === 'available') return Number(entry.available ?? 0) || 0;
      return Number(entry.total ?? 0) || 0;
    }
    if (expr.kind === 'tileMetric') {
      if (expr.metric === 'adjacentTagCount') {
        return this.countTagsInRange(ctx, String(expr.key ?? ''), 1);
      }
      if (expr.metric === 'adjacentBuildingCount') {
        return this.countBuildingsInRange(ctx, String(expr.key ?? ''), 1);
      }
      if (expr.metric === 'tileStateValue') {
        const key = this.tileKey(ctx.origin.col, ctx.origin.row);
        const target = (ctx.tileStates[key] ?? []).find((entry) => entry.presetId === String(expr.key ?? ''));
        const n = Number(target?.value ?? 0);
        return Number.isFinite(n) ? n : 0;
      }
      return 0;
    }
    if (expr.kind === 'binary') {
      const left = this.evalRuleExpr(expr.left, ctx);
      const right = this.evalRuleExpr(expr.right, ctx);
      switch (expr.op) {
        case 'add':
          return left + right;
        case 'sub':
          return left - right;
        case 'mul':
          return left * right;
        case 'div':
          return right === 0 ? 0 : left / right;
        case 'min':
          return Math.min(left, right);
        case 'max':
          return Math.max(left, right);
        default:
          return 0;
      }
    }
    if (expr.kind === 'clamp') {
      const v = this.evalRuleExpr(expr.value, ctx);
      const min = Number.isFinite(Number(expr.min)) ? Number(expr.min) : -Infinity;
      const max = Number.isFinite(Number(expr.max)) ? Number(expr.max) : Infinity;
      return Math.max(min, Math.min(max, v));
    }
    if (expr.kind === 'randPct') {
      const pct = Math.max(0, Math.min(100, Number(expr.pct ?? 0)));
      return Math.random() * 100 < pct ? 1 : 0;
    }
    return 0;
  }

  private compareByOp(left: number, right: number, op: string) {
    if (op === 'eq') return left === right;
    if (op === 'ne') return left !== right;
    if (op === 'gt') return left > right;
    if (op === 'gte') return left >= right;
    if (op === 'lt') return left < right;
    if (op === 'lte') return left <= right;
    return false;
  }

  private getTotalPopulation(population: CityPopulationState) {
    return (
      Math.max(0, population.settlers?.total ?? 0) +
      Math.max(0, population.engineers?.total ?? 0) +
      Math.max(0, population.scholars?.total ?? 0) +
      Math.max(0, population.laborers?.total ?? 0) +
      Math.max(0, population.elderly?.total ?? 0)
    );
  }

  private getAvailableNonElderly(population: CityPopulationState) {
    return (
      Math.max(0, population.settlers?.available ?? 0) +
      Math.max(0, population.engineers?.available ?? 0) +
      Math.max(0, population.scholars?.available ?? 0) +
      Math.max(0, population.laborers?.available ?? 0)
    );
  }

  private extractAssignedWorkersByTypeFromMeta(
    meta: unknown,
  ): Record<PopulationTrackedId, number> {
    const base = this.toPlainRecord(meta) ?? {};
    const build = this.toPlainRecord(base.buildMeta) ?? {};
    const byTypeRaw =
      (this.toPlainRecord(build.assignedWorkersByType) ??
        this.toPlainRecord(base.assignedWorkersByType) ??
        {}) as Record<string, unknown>;

    const out: Record<PopulationTrackedId, number> = {
      settlers: 0,
      engineers: 0,
      scholars: 0,
      laborers: 0,
    };
    for (const id of TRACKED_WORKER_POPULATION_IDS) {
      const parsed = Math.max(0, Math.trunc(Number(byTypeRaw[id] ?? 0) || 0));
      out[id] = parsed;
    }
    const total = this.sumAssignedWorkersByType(out);
    if (total <= 0) {
      const legacy = Math.max(0, Math.trunc(Number(build.assignedWorkers ?? base.assignedWorkers ?? 0) || 0));
      if (legacy > 0) out.laborers = legacy;
    }
    return out;
  }

  private sumAssignedWorkersByType(byType: Record<PopulationTrackedId, number>) {
    return TRACKED_WORKER_POPULATION_IDS.reduce(
      (sum, id) => sum + Math.max(0, Math.trunc(Number(byType[id] ?? 0) || 0)),
      0,
    );
  }

  private extractAssignedWorkersFromMeta(meta: unknown) {
    return this.sumAssignedWorkersByType(this.extractAssignedWorkersByTypeFromMeta(meta));
  }

  private readBuildStatusFromMeta(meta: unknown): BuildRuntimeStatus | null {
    const base = this.toPlainRecord(meta) ?? {};
    const build = this.toPlainRecord(base.buildMeta) ?? {};
    const raw = String(build.status ?? '').trim();
    if (raw === 'building' || raw === 'active') return raw;
    return null;
  }

  private withBuildMeta(
    meta: unknown,
    status: BuildRuntimeStatus,
    assignedWorkers: number,
    assignedWorkersByType?: Partial<Record<PopulationTrackedId, number>>,
  ): Record<string, unknown> {
    const base = this.toPlainRecord(meta) ?? {};
    const prevBuild = this.toPlainRecord(base.buildMeta) ?? {};
    const normalizedByType = {
      ...this.extractAssignedWorkersByTypeFromMeta(meta),
      ...(assignedWorkersByType ?? {}),
    } as Record<PopulationTrackedId, number>;
    for (const id of TRACKED_WORKER_POPULATION_IDS) {
      normalizedByType[id] = Math.max(
        0,
        Math.trunc(Number(normalizedByType[id] ?? 0) || 0),
      );
    }
    const total = Math.max(
      0,
      Math.trunc(
        Number(assignedWorkers) ||
          this.sumAssignedWorkersByType(normalizedByType),
      ),
    );
    return {
      ...base,
      assignedWorkers: total,
      assignedWorkersByType: normalizedByType,
      buildMeta: {
        ...prevBuild,
        status,
        assignedWorkers: total,
        assignedWorkersByType: normalizedByType,
      },
    };
  }

  private canReserveWorkersByType(
    population: CityPopulationState,
    workersByType: Record<PopulationTrackedId, number>,
  ) {
    for (const id of TRACKED_WORKER_POPULATION_IDS) {
      const required = Math.max(0, Math.trunc(Number(workersByType[id] ?? 0) || 0));
      if (required <= 0) continue;
      const available = Math.max(
        0,
        Math.trunc(Number(population[id]?.available ?? 0) || 0),
      );
      if (available < required) return false;
    }
    return true;
  }

  private reserveWorkersByType(
    population: CityPopulationState,
    workersByType: Record<PopulationTrackedId, number>,
  ) {
    for (const id of TRACKED_WORKER_POPULATION_IDS) {
      const required = Math.max(0, Math.trunc(Number(workersByType[id] ?? 0) || 0));
      if (required <= 0) continue;
      const entry = population[id] ?? { total: 0, available: 0 };
      const available = Math.max(0, Math.trunc(Number(entry.available ?? 0) || 0));
      entry.available = Math.max(0, available - required);
      population[id] = entry;
    }
  }

  private releaseWorkersByType(
    population: CityPopulationState,
    workersByType: Record<PopulationTrackedId, number>,
  ) {
    for (const id of TRACKED_WORKER_POPULATION_IDS) {
      const releasing = Math.max(0, Math.trunc(Number(workersByType[id] ?? 0) || 0));
      if (releasing <= 0) continue;
      const entry = population[id] ?? { total: 0, available: 0 };
      const total = Math.max(0, Math.trunc(Number(entry.total ?? 0) || 0));
      const available = Math.max(0, Math.trunc(Number(entry.available ?? 0) || 0));
      entry.available = Math.min(total, available + releasing);
      population[id] = entry;
    }
  }

  private tryConsumeDailyUpkeep(preset: WorldMapBuildingPresetRow, cityGlobal: CityGlobalState) {
    const upkeep = preset.upkeep ?? {};
    const resourceCosts = upkeep.resources ?? {};
    const populationCosts = upkeep.population ?? {};
    const reasons: string[] = [];

    for (const [rawId, rawCost] of Object.entries(resourceCosts)) {
      const resourceId = this.normalizeBuildingResourceId(rawId);
      if (!resourceId) continue;
      const cost = Math.max(0, Math.trunc(Number(rawCost) || 0));
      if (cost <= 0) continue;
      const current = this.getBuildingResourceAmount(cityGlobal, resourceId);
      if (current < cost) {
        reasons.push(`${this.getBuildingResourceLabel(resourceId)} 부족(${current}/${cost})`);
      }
    }

    for (const [rawId, rawCost] of Object.entries(populationCosts)) {
      const populationId = rawId as UpkeepPopulationId;
      const cost = Math.max(0, Math.trunc(Number(rawCost) || 0));
      if (cost <= 0) continue;
      if (populationId === 'anyNonElderly') {
        const current = this.getAvailableNonElderly(cityGlobal.population);
        if (current < cost) {
          reasons.push(`${POPULATION_LABELS[populationId]} 부족(${current}/${cost})`);
        }
        continue;
      }
      if (populationId === 'elderly') {
        const current = Math.max(
          0,
          Math.trunc(
            Number(cityGlobal.population.elderly?.available ?? cityGlobal.population.elderly?.total ?? 0),
          ),
        );
        if (current < cost) {
          reasons.push(`${POPULATION_LABELS[populationId]} 부족(${current}/${cost})`);
        }
        continue;
      }
      const entry = cityGlobal.population[populationId] ?? { total: 0, available: 0 };
      const current = Math.max(0, Math.trunc(Number(entry.available ?? 0)));
      if (current < cost) {
        reasons.push(`${POPULATION_LABELS[populationId]} 부족(${current}/${cost})`);
      }
    }

    if (reasons.length > 0) return { ok: false as const, reasons };

    for (const [rawId, rawCost] of Object.entries(resourceCosts)) {
      const resourceId = this.normalizeBuildingResourceId(rawId);
      if (!resourceId) continue;
      const cost = Math.max(0, Math.trunc(Number(rawCost) || 0));
      if (cost <= 0) continue;
      const current = this.getBuildingResourceAmount(cityGlobal, resourceId);
      this.setBuildingResourceAmount(cityGlobal, resourceId, Math.max(0, current - cost));
    }
    // 유지 인구는 "소모"가 아니라 "요구 충족" 개념이므로 일일 실행 시 인구를 차감하지 않는다.
    return { ok: true as const, reasons: [] as string[] };
  }

  private getTileRegionState(ctx: RuntimeContext, col: number, row: number): MapTileRegionState {
    const key = this.tileKey(col, row);
    const state = (ctx.tileRegions[key] ?? {}) as MapTileRegionState;
    return {
      spaceUsed: Math.max(0, Math.trunc(Number(state.spaceUsed ?? 0))),
      spaceCap: Math.max(0, Math.trunc(Number(state.spaceCap ?? 0))),
      satisfaction: Math.max(0, Math.trunc(Number(state.satisfaction ?? 0))),
      threat: Math.max(0, Math.trunc(Number(state.threat ?? 0))),
      pollution: Math.max(0, Math.trunc(Number(state.pollution ?? 0))),
    };
  }

  private countTagsInRange(
    ctx: RuntimeContext,
    tagPresetId: string,
    distance: number,
    valueMode?: 'equals' | 'contains',
    value?: string,
  ) {
    if (!tagPresetId) return 0;
    const targets = this.resolveTargetTilesByDistance(ctx, Math.max(0, distance));
    const expect = String(value ?? '').trim();
    let count = 0;
    for (const key of targets) {
      const entries = ctx.tileStates[key] ?? [];
      const matched = entries.some((entry) => {
        if (entry.presetId !== tagPresetId) return false;
        if (!expect) return true;
        const raw = String(entry.value ?? '');
        if (valueMode === 'contains') return raw.includes(expect);
        return raw === expect;
      });
      if (matched) count += 1;
    }
    return count;
  }

  private countBuildingsInRange(ctx: RuntimeContext, presetId: string, distance: number) {
    if (!presetId) return 0;
    const maxDistance = Math.max(0, distance);
    return ctx.instances.filter((entry) => {
      if (!entry.enabled || entry.presetId !== presetId) return false;
      return (
        this.hexDistance(ctx.origin.col, ctx.origin.row, entry.col, entry.row, ctx.orientation) <=
        maxDistance
      );
    }).length;
  }

  private getTargetTileCountByDistance(ctx: RuntimeContext, distance: number) {
    return this.resolveTargetTilesByDistance(ctx, Math.max(0, distance)).length;
  }

  private resolveActionTargetTiles(
    ctx: RuntimeContext,
    target: 'self' | 'range' | undefined,
    distance: number | undefined,
  ) {
    if (target === 'range') return this.resolveTargetTilesByDistance(ctx, Math.max(0, Math.trunc(Number(distance ?? 1) || 0)));
    return [this.tileKey(ctx.origin.col, ctx.origin.row)];
  }

  private resolveTargetTilesByDistance(ctx: RuntimeContext, maxDistance: number) {
    const out = new Set<string>();
    const cols = Math.max(1, Math.trunc(Number(ctx.cols) || 1));
    const rows = Math.max(1, Math.trunc(Number(ctx.rows) || 1));
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        if (
          this.hexDistance(ctx.origin.col, ctx.origin.row, col, row, ctx.orientation) <=
          maxDistance
        ) {
          out.add(this.tileKey(col, row));
        }
      }
    }
    return [...out];
  }

  private tileKey(col: number, row: number) {
    return `${col}:${row}`;
  }

  private parseTileKey(key: string): [number | null, number | null] {
    const [a, b] = String(key ?? '').split(':');
    const col = Math.trunc(Number(a));
    const row = Math.trunc(Number(b));
    if (!Number.isFinite(col) || !Number.isFinite(row)) return [null, null];
    return [col, row];
  }

  private toAxial(col: number, row: number, orientation: HexOrientation): [number, number] {
    if (orientation === 'flat') {
      const q = col - Math.floor((row - (row & 1)) / 2);
      const r = row;
      return [q, r];
    }
    const q = col;
    const r = row - Math.floor((col - (col & 1)) / 2);
    return [q, r];
  }

  private hexDistance(
    colA: number,
    rowA: number,
    colB: number,
    rowB: number,
    orientation: HexOrientation,
  ) {
    const [q1, r1] = this.toAxial(colA, rowA, orientation);
    const [q2, r2] = this.toAxial(colB, rowB, orientation);
    const dq = q1 - q2;
    const dr = r1 - r2;
    const ds = -q1 - r1 - (-q2 - r2);
    return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(ds));
  }

  private ensureStorage() {
    mkdirSync(this.assetDir, { recursive: true });
  }

  private async migrateLegacyJsonIfNeeded() {
    if (!existsSync(this.legacyMetaPath)) return;

    let parsed: unknown;
    try {
      const raw = readFileSync(this.legacyMetaPath, 'utf8');
      parsed = JSON.parse(raw);
    } catch (e: any) {
      this.logger.warn(
        `legacy maps.json 읽기 실패: ${String(e?.message ?? e)}`,
      );
      return;
    }

    if (!Array.isArray(parsed) || parsed.length === 0) return;

    const users = await this.prisma.user.findMany({ select: { id: true } });
    const userIds = new Set(users.map((u) => u.id));

    let created = 0;
    let skipped = 0;
    let failed = 0;

    for (const item of parsed) {
      try {
        const ownerId = String((item as any)?.ownerId ?? '').trim();
        if (!ownerId || !userIds.has(ownerId)) {
          skipped += 1;
          continue;
        }

        const data = this.normalizeLegacyRow(item, ownerId);
        const exists = await this.prisma.worldMap.findUnique({
          where: { id: data.id },
          select: { id: true },
        });
        if (exists) {
          skipped += 1;
          continue;
        }

        await this.prisma.worldMap.create({ data });
        created += 1;
      } catch (e: any) {
        failed += 1;
        this.logger.warn(`legacy world map 마이그레이션 실패: ${String(e?.message ?? e)}`);
      }
    }

    if (created > 0 || failed > 0) {
      this.logger.log(
        `legacy world maps migration 완료: created=${created}, skipped=${skipped}, failed=${failed}`,
      );
    }
  }

  private toPublic(row: any): PublicWorldMap {
    return {
      id: row.id,
      ownerId: row.ownerId,
      name: row.name,
      imageUrl:
        typeof row.imageUrl === 'string' && row.imageUrl.trim()
          ? row.imageUrl.trim()
          : null,
      imageWidth:
        typeof row.imageWidth === 'number' && Number.isFinite(row.imageWidth)
          ? row.imageWidth
          : null,
      imageHeight:
        typeof row.imageHeight === 'number' && Number.isFinite(row.imageHeight)
          ? row.imageHeight
          : null,
      hexSize:
        typeof row.hexSize === 'number' && Number.isFinite(row.hexSize)
          ? row.hexSize
          : DEFAULT_HEX_SIZE,
      originX:
        typeof row.originX === 'number' && Number.isFinite(row.originX)
          ? row.originX
          : DEFAULT_ORIGIN_X,
      originY:
        typeof row.originY === 'number' && Number.isFinite(row.originY)
          ? row.originY
          : DEFAULT_ORIGIN_Y,
      cols:
        typeof row.cols === 'number' && Number.isFinite(row.cols)
          ? Math.max(1, Math.trunc(row.cols))
          : DEFAULT_COLS,
      rows:
        typeof row.rows === 'number' && Number.isFinite(row.rows)
          ? Math.max(1, Math.trunc(row.rows))
          : DEFAULT_ROWS,
      orientation: row.orientation === 'flat' ? 'flat' : DEFAULT_ORIENTATION,
      cityGlobal: this.normalizeCityGlobalInput(row.cityGlobal),
      tileStatePresets: this.normalizeTilePresetsInput(row.tileStatePresets),
      tileStateAssignments: this.normalizeTileStateAssignmentsInput(
        row.tileStateAssignments,
        this.normalizeTilePresetsInput(row.tileStatePresets),
      ),
      tileRegionStates: this.normalizeTileRegionStatesInput(row.tileRegionStates),
      buildingPresets: this.normalizeBuildingPresetsInput(row.buildingPresets),
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : String(row.createdAt ?? new Date().toISOString()),
      updatedAt:
        row.updatedAt instanceof Date
          ? row.updatedAt.toISOString()
          : String(row.updatedAt ?? new Date().toISOString()),
    };
  }

  private toBuildingPresetRow(row: any): WorldMapBuildingPresetRow {
    return {
      id: row.id,
      mapId: row.mapId,
      name: row.name,
      color: this.normalizeHexColor(row.color, '#eab308'),
      tier: String(row.tier ?? '').trim() || undefined,
      effort: this.toNullableIntMin(row.effort, 0) ?? undefined,
      space: this.toNullableIntMin(row.space, 0) ?? undefined,
      description: String(row.description ?? '').trim() || undefined,
      placementRules: this.normalizePlacementRulesInput(row.placementRules) ?? undefined,
      buildCost: this.normalizeResourceCostsInput(row.buildCost) ?? undefined,
      researchCost: this.normalizeResourceCostsInput(row.researchCost) ?? undefined,
      upkeep: this.normalizeUpkeepInput(row.upkeep) ?? undefined,
      effects: this.normalizeEffectsInput(row.effects) ?? undefined,
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : String(row.createdAt ?? new Date().toISOString()),
      updatedAt:
        row.updatedAt instanceof Date
          ? row.updatedAt.toISOString()
          : String(row.updatedAt ?? new Date().toISOString()),
    };
  }

  private toBuildingInstanceRow(row: any): WorldMapBuildingInstanceRow {
    return {
      id: row.id,
      mapId: row.mapId,
      presetId: row.presetId,
      col: this.toInt(row.col, 'col', -1000000, 1000000),
      row: this.toInt(row.row, 'row', -1000000, 1000000),
      enabled: !!row.enabled,
      progressEffort: this.toInt(row.progressEffort ?? 0, 'progressEffort', 0, 1_000_000),
      meta: this.toPlainRecord(row.meta),
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : String(row.createdAt ?? new Date().toISOString()),
      updatedAt:
        row.updatedAt instanceof Date
          ? row.updatedAt.toISOString()
          : String(row.updatedAt ?? new Date().toISOString()),
    };
  }

  private toTickLogRow(row: any): WorldMapTickLogRow {
    return {
      id: row.id,
      mapId: row.mapId,
      day: this.toInt(row.day, 'day', 0, 1_000_000),
      summary: this.toPlainRecord(row.summary),
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : String(row.createdAt ?? new Date().toISOString()),
    };
  }

  private normalizeHexColor(input: unknown, fallback = '#e5e7eb') {
    if (typeof input !== 'string') return fallback;
    const v = input.trim();
    const six = v.match(/^#?([0-9a-fA-F]{6})$/);
    if (six) return `#${six[1].toLowerCase()}`;
    const three = v.match(/^#?([0-9a-fA-F]{3})$/);
    if (three) {
      const [r, g, b] = three[1].split('');
      return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    return fallback;
  }

  private toNullableIntMin(value: unknown, min = 0): number | null {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const n = Math.trunc(Number(value));
    if (!Number.isFinite(n)) return null;
    return Math.max(min, n);
  }

  private toPlainRecord(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    return value as Record<string, unknown>;
  }

  private isBaseResourceId(value: string): value is ResourceId {
    return RESOURCE_IDS.includes(value as ResourceId);
  }

  private normalizeBuildingResourceId(value: unknown): BuildingResourceId | undefined {
    const raw = String(value ?? '').trim();
    if (!raw) return undefined;
    if (this.isBaseResourceId(raw)) return raw;
    if (raw.startsWith('item:')) {
      const name = raw.slice(5).trim();
      if (!name) return undefined;
      return `item:${name}`;
    }
    return undefined;
  }

  private getWarehouseAmount(cityGlobal: CityGlobalState, itemName: string) {
    const warehouse = cityGlobal.warehouse ?? {};
    return Math.max(0, Math.trunc(Number(warehouse[itemName] ?? 0) || 0));
  }

  private setWarehouseAmount(cityGlobal: CityGlobalState, itemName: string, amount: number) {
    const warehouse = cityGlobal.warehouse ?? {};
    const next = Math.max(0, Math.trunc(Number(amount) || 0));
    if (next <= 0) {
      if (Object.prototype.hasOwnProperty.call(warehouse, itemName)) {
        delete warehouse[itemName];
      }
    } else {
      warehouse[itemName] = next;
    }
    cityGlobal.warehouse = warehouse;
  }

  private getBuildingResourceAmount(cityGlobal: CityGlobalState, resourceId: BuildingResourceId) {
    if (this.isBaseResourceId(resourceId)) {
      return Math.max(0, Math.trunc(Number(cityGlobal.values[resourceId] ?? 0) || 0));
    }
    const itemName = resourceId.slice(5).trim();
    if (!itemName) return 0;
    return this.getWarehouseAmount(cityGlobal, itemName);
  }

  private setBuildingResourceAmount(
    cityGlobal: CityGlobalState,
    resourceId: BuildingResourceId,
    amount: number,
  ) {
    const next = Math.max(0, Math.trunc(Number(amount) || 0));
    if (this.isBaseResourceId(resourceId)) {
      cityGlobal.values[resourceId] = next;
      return;
    }
    const itemName = resourceId.slice(5).trim();
    if (!itemName) return;
    this.setWarehouseAmount(cityGlobal, itemName, next);
  }

  private getBuildingResourceLabel(resourceId: BuildingResourceId) {
    if (this.isBaseResourceId(resourceId)) return RESOURCE_LABELS[resourceId] ?? resourceId;
    return resourceId.startsWith('item:') ? resourceId.slice(5).trim() || resourceId : resourceId;
  }

  private normalizeResourceCostsInput(
    input: unknown,
  ): Partial<Record<BuildingResourceId, number>> | undefined {
    const src = this.toPlainRecord(input);
    if (!src) return undefined;
    const out: Partial<Record<BuildingResourceId, number>> = {};
    for (const [rawId, rawValue] of Object.entries(src)) {
      const id = this.normalizeBuildingResourceId(rawId);
      if (!id) continue;
      const n = this.toNullableIntMin(rawValue, 0);
      if (n != null) out[id] = n;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }

  private normalizePopulationCostsInput(
    input: unknown,
  ): Partial<Record<UpkeepPopulationId, number>> | undefined {
    const src = this.toPlainRecord(input);
    if (!src) return undefined;
    const out: Partial<Record<UpkeepPopulationId, number>> = {};
    for (const id of UPKEEP_POPULATION_IDS) {
      const n = this.toNullableIntMin(src[id], 0);
      if (n != null) out[id] = n;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }

  private normalizePlacementRulesInput(input: unknown): BuildingPlacementRule[] | undefined {
    if (!Array.isArray(input)) return undefined;
    const out: BuildingPlacementRule[] = [];
    for (const entry of input) {
      if (!entry || typeof entry !== 'object') continue;
      const kind = String((entry as any).kind ?? '').trim();
      if (!kind) continue;
      if (kind === 'uniquePerTile') {
        const maxCount = this.toNullableIntMin((entry as any).maxCount, 1) ?? 1;
        out.push({ kind: 'uniquePerTile', maxCount });
        continue;
      }
      if (kind === 'tileRegionCompare') {
        const fieldRaw = String((entry as any).field ?? '').trim();
        const field =
          fieldRaw === 'spaceRemaining' ||
          fieldRaw === 'pollution' ||
          fieldRaw === 'threat' ||
          fieldRaw === 'satisfaction'
            ? fieldRaw
            : 'spaceRemaining';
        const opRaw = String((entry as any).op ?? '').trim();
        const op =
          opRaw === 'eq' ||
          opRaw === 'ne' ||
          opRaw === 'gt' ||
          opRaw === 'gte' ||
          opRaw === 'lt' ||
          opRaw === 'lte'
            ? opRaw
            : 'gte';
        const value = this.toNullableIntMin((entry as any).value, 0) ?? 0;
        out.push({ kind: 'tileRegionCompare', field, op, value });
        continue;
      }
      if (kind === 'requireTagInRange') {
        const tagPresetId = String((entry as any).tagPresetId ?? '').trim();
        if (!tagPresetId) continue;
        const distance = this.toNullableIntMin((entry as any).distance, 0) ?? 1;
        const minCount = this.toNullableIntMin((entry as any).minCount, 0) ?? undefined;
        const negate = !!(entry as any).negate;
        const repeat = !!(entry as any).repeat;
        const valueModeRaw = String((entry as any).valueMode ?? '').trim();
        const valueMode =
          valueModeRaw === 'equals' || valueModeRaw === 'contains'
            ? (valueModeRaw as 'equals' | 'contains')
            : undefined;
        const value = String((entry as any).value ?? '').trim() || undefined;
        out.push({
          kind: 'requireTagInRange',
          tagPresetId,
          distance,
          minCount,
          negate,
          repeat,
          ...(valueMode ? { valueMode } : {}),
          ...(value ? { value } : {}),
        });
        continue;
      }
      if (kind === 'requireBuildingInRange') {
        const presetId = String((entry as any).presetId ?? '').trim();
        if (!presetId) continue;
        const distance = this.toNullableIntMin((entry as any).distance, 0) ?? 1;
        const minCount = this.toNullableIntMin((entry as any).minCount, 0) ?? undefined;
        const negate = !!(entry as any).negate;
        const repeat = !!(entry as any).repeat;
        out.push({ kind: 'requireBuildingInRange', presetId, distance, minCount, negate, repeat });
        continue;
      }
      // legacy compatibility
      if (kind === 'requireAdjacentTag') {
        const tagId = String((entry as any).tagId ?? '').trim();
        if (!tagId) continue;
        const minCount = this.toNullableIntMin((entry as any).minCount, 0) ?? undefined;
        out.push({ kind: 'requireTagInRange', tagPresetId: tagId, distance: 1, minCount });
        continue;
      }
      if (kind === 'requireAdjacentBuilding') {
        const presetId = String((entry as any).presetId ?? '').trim();
        if (!presetId) continue;
        const minCount = this.toNullableIntMin((entry as any).minCount, 0) ?? undefined;
        out.push({ kind: 'requireBuildingInRange', presetId, distance: 1, minCount });
        continue;
      }
      if (kind === 'custom') {
        const label = String((entry as any).label ?? '').trim();
        if (!label) continue;
        out.push({ kind: 'custom', label });
      }
    }
    return out.length > 0 ? out : undefined;
  }

  private normalizeActionsInput(input: unknown): BuildingRuleAction[] {
    if (!Array.isArray(input)) return [];
    const out: BuildingRuleAction[] = [];
    const normalizeTarget = (entry: Record<string, unknown>) => {
      const target: 'self' | 'range' =
        String(entry.target ?? '').trim() === 'range' ? 'range' : 'self';
      const distance =
        target === 'range'
          ? this.toNullableIntMin(entry.distance, 0) ?? 1
          : undefined;
      return target === 'range' ? { target, distance } : { target };
    };
    for (const entry of input) {
      if (!entry || typeof entry !== 'object') continue;
      const cast = entry as Record<string, unknown>;
      const kind = String(cast.kind ?? '').trim();
      if (!kind) continue;
      if (kind === 'adjustResource') {
        const resourceId = this.normalizeBuildingResourceId(cast.resourceId) ?? 'gold';
        out.push({
          kind,
          resourceId,
          delta: (cast.delta ?? { kind: 'const', value: 0 }) as any,
          ...normalizeTarget(cast),
        });
        continue;
      }
      if (kind === 'adjustResourceCap') {
        const capped = ['wood', 'stone', 'fabric', 'weave', 'food'] as const;
        const resourceIdRaw = String(cast.resourceId ?? '').trim();
        const resourceId: (typeof capped)[number] = capped.includes(resourceIdRaw as any)
          ? (resourceIdRaw as (typeof capped)[number])
          : 'wood';
        out.push({
          kind,
          resourceId,
          delta: (cast.delta ?? { kind: 'const', value: 0 }) as any,
          ...normalizeTarget(cast),
        });
        continue;
      }
      if (kind === 'adjustPopulation') {
        const populationIdRaw = String(cast.populationId ?? '').trim();
        const populationId: PopulationTrackedId =
          populationIdRaw === 'settlers' ||
          populationIdRaw === 'engineers' ||
          populationIdRaw === 'scholars' ||
          populationIdRaw === 'laborers'
            ? (populationIdRaw as PopulationTrackedId)
            : 'settlers';
        const field = String(cast.field ?? '').trim() === 'total' ? 'total' : 'available';
        out.push({
          kind,
          populationId,
          field,
          delta: (cast.delta ?? { kind: 'const', value: 0 }) as any,
          ...normalizeTarget(cast),
        });
        continue;
      }
      if (kind === 'adjustPopulationCap') {
        out.push({
          kind,
          delta: (cast.delta ?? { kind: 'const', value: 0 }) as any,
          ...normalizeTarget(cast),
        });
        continue;
      }
      if (kind === 'convertPopulation') {
        const fromRaw = String(cast.from ?? '').trim();
        const toRaw = String(cast.to ?? '').trim();
        const normalizeTracked = (value: string): PopulationTrackedId =>
          value === 'settlers' ||
          value === 'engineers' ||
          value === 'scholars' ||
          value === 'laborers'
            ? (value as PopulationTrackedId)
            : 'settlers';
        out.push({
          kind,
          from: normalizeTracked(fromRaw),
          to: normalizeTracked(toRaw),
          amount: (cast.amount ?? { kind: 'const', value: 1 }) as any,
          ...normalizeTarget(cast),
        });
        continue;
      }
      if (kind === 'adjustTileRegion') {
        const fieldRaw = String(cast.field ?? '').trim();
        const field: keyof MapTileRegionState =
          fieldRaw === 'spaceUsed' ||
          fieldRaw === 'spaceCap' ||
          fieldRaw === 'satisfaction' ||
          fieldRaw === 'threat' ||
          fieldRaw === 'pollution'
            ? (fieldRaw as keyof MapTileRegionState)
            : 'threat';
        out.push({
          kind,
          field,
          delta: (cast.delta ?? { kind: 'const', value: 0 }) as any,
          ...normalizeTarget(cast),
        });
        continue;
      }
      if (kind === 'addTileState') {
        const tagPresetId = String(cast.tagPresetId ?? '').trim();
        if (!tagPresetId) continue;
        out.push({
          kind,
          tagPresetId,
          ...(cast.value != null ? { value: String(cast.value ?? '').trim() } : {}),
          ...normalizeTarget(cast),
        });
        continue;
      }
      if (kind === 'removeTileState') {
        const tagPresetId = String(cast.tagPresetId ?? '').trim();
        if (!tagPresetId) continue;
        out.push({
          kind,
          tagPresetId,
          ...normalizeTarget(cast),
        });
      }
    }
    return out;
  }

  private normalizeExecutionRulesInput(
    input: unknown,
    withInterval = false,
  ): BuildingExecutionRule[] | undefined {
    if (!Array.isArray(input)) return undefined;
    const out: BuildingExecutionRule[] = [];
    for (const entry of input) {
      if (!entry || typeof entry !== 'object') continue;
      const id = String((entry as any).id ?? '').trim() || randomUUID();
      const actions = this.normalizeActionsInput((entry as any).actions);
      if (actions.length === 0) continue;
      const intervalRaw = Math.trunc(Number((entry as any).intervalDays));
      const intervalDays =
        withInterval && Number.isFinite(intervalRaw)
          ? Math.max(1, intervalRaw)
          : withInterval
            ? 1
            : undefined;
      const when =
        (entry as any).when && typeof (entry as any).when === 'object'
          ? ((entry as any).when as any)
          : undefined;
      out.push({ id, ...(withInterval ? { intervalDays } : {}), when, actions });
    }
    return out.length > 0 ? out : undefined;
  }

  private normalizeUpkeepInput(
    input: unknown,
  ):
    | {
        resources?: Partial<Record<BuildingResourceId, number>>;
        population?: Partial<Record<UpkeepPopulationId, number>>;
      }
    | undefined {
    const src = this.toPlainRecord(input);
    if (!src) return undefined;
    const resources = this.normalizeResourceCostsInput(src.resources);
    const population = this.normalizePopulationCostsInput(src.population);
    if (!resources && !population) return undefined;
    return { ...(resources ? { resources } : {}), ...(population ? { population } : {}) };
  }

  private normalizeEffectsInput(
    input: unknown,
  ):
    | {
        onBuild?: BuildingExecutionRule[];
        daily?: BuildingExecutionRule[];
        onRemove?: BuildingExecutionRule[];
      }
    | undefined {
    const src = this.toPlainRecord(input);
    if (!src) return undefined;
    const onBuild = this.normalizeExecutionRulesInput(src.onBuild, false);
    const daily = this.normalizeExecutionRulesInput(src.daily, true);
    const onRemove = this.normalizeExecutionRulesInput(src.onRemove, false);
    if (!onBuild && !daily && !onRemove) return undefined;
    return { ...(onBuild ? { onBuild } : {}), ...(daily ? { daily } : {}), ...(onRemove ? { onRemove } : {}) };
  }

  private normalizeLegacyRow(input: unknown, ownerId: string) {
    const src = (input ?? {}) as Record<string, unknown>;
    const presets = this.normalizeTilePresetsInput(src.tileStatePresets);
    const assignments = this.normalizeTileStateAssignmentsInput(
      src.tileStateAssignments,
      presets,
    );

    const createdAt = this.parseDateMaybe(src.createdAt);
    const updatedAt = this.parseDateMaybe(src.updatedAt);

    const imageWidth = this.toNullablePositiveInt(src.imageWidth);
    const imageHeight = this.toNullablePositiveInt(src.imageHeight);
    const name = String(src.name ?? '').trim() || '이름 없는 지도';
    const imageUrlRaw = String(src.imageUrl ?? '').trim();

    return {
      id: String(src.id ?? '').trim() || randomUUID(),
      ownerId,
      name,
      imageUrl: imageUrlRaw || null,
      imageWidth,
      imageHeight,
      hexSize:
        typeof src.hexSize === 'number' && Number.isFinite(src.hexSize)
          ? src.hexSize
          : DEFAULT_HEX_SIZE,
      originX:
        typeof src.originX === 'number' && Number.isFinite(src.originX)
          ? src.originX
          : DEFAULT_ORIGIN_X,
      originY:
        typeof src.originY === 'number' && Number.isFinite(src.originY)
          ? src.originY
          : DEFAULT_ORIGIN_Y,
      cols:
        typeof src.cols === 'number' && Number.isFinite(src.cols)
          ? Math.max(1, Math.trunc(src.cols))
          : DEFAULT_COLS,
      rows:
        typeof src.rows === 'number' && Number.isFinite(src.rows)
          ? Math.max(1, Math.trunc(src.rows))
          : DEFAULT_ROWS,
      orientation: src.orientation === 'flat' ? 'flat' : DEFAULT_ORIENTATION,
      cityGlobal: this.normalizeCityGlobalInput(src.cityGlobal),
      tileStatePresets: presets,
      tileStateAssignments: assignments,
      tileRegionStates: this.normalizeTileRegionStatesInput(src.tileRegionStates),
      buildingPresets: this.normalizeBuildingPresetsInput(src.buildingPresets),
      ...(createdAt ? { createdAt } : {}),
      ...(updatedAt ? { updatedAt } : {}),
    };
  }

  private toNullablePositiveInt(value: unknown): number | null {
    const n = Math.trunc(Number(value));
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  }

  private parseDateMaybe(value: unknown): Date | null {
    if (value == null) return null;
    const d = new Date(String(value));
    if (Number.isNaN(d.getTime())) return null;
    return d;
  }

  private normalizeTilePresetsInput(input: unknown): MapTileStatePreset[] {
    if (!Array.isArray(input)) return [];
    const out: MapTileStatePreset[] = [];
    const seen = new Set<string>();
    for (const entry of input) {
      const item = entry as Partial<MapTileStatePreset> | null | undefined;
      const id = String(item?.id ?? '').trim();
      const name = String(item?.name ?? '').trim();
      if (!id || !name || seen.has(id)) continue;
      seen.add(id);
      out.push({
        id,
        name,
        color: this.normalizeHexColor(item?.color),
        hasValue: !!item?.hasValue,
      });
    }
    return out;
  }

  private normalizeTileStateAssignmentsInput(
    input: unknown,
    presets: MapTileStatePreset[],
  ): Record<string, MapTileStateAssignment[]> {
    const src = input as Record<string, unknown>;
    if (!src || typeof src !== 'object') return {};
    const validPresetIds = new Set(presets.map((p) => p.id));
    const out: Record<string, MapTileStateAssignment[]> = {};
    for (const [key, value] of Object.entries(src)) {
      if (!Array.isArray(value)) continue;
      const next: MapTileStateAssignment[] = [];
      for (const item of value) {
        const cast = item as Partial<MapTileStateAssignment> | null | undefined;
        const presetId = String(cast?.presetId ?? '').trim();
        if (!presetId || !validPresetIds.has(presetId)) continue;
        const preset = presets.find((p) => p.id === presetId);
        if (!preset) continue;
        const assignment: MapTileStateAssignment = { presetId };
        if (preset.hasValue && cast?.value != null) {
          assignment.value = String(cast.value).trim();
        }
        next.push(assignment);
      }
      if (next.length > 0) out[key] = next;
    }
    return out;
  }

  private normalizeTileRegionStatesInput(
    input: unknown,
  ): Record<string, MapTileRegionState> {
    const src = input as Record<string, unknown>;
    if (!src || typeof src !== 'object') return {};
    const out: Record<string, MapTileRegionState> = {};
    const toIntOrUndef = (v: unknown): number | undefined => {
      if (v === null || v === undefined || String(v).trim() === '') return undefined;
      const n = Math.trunc(Number(v));
      if (!Number.isFinite(n)) return undefined;
      return n;
    };

    for (const [key, value] of Object.entries(src)) {
      if (!value || typeof value !== 'object') continue;
      const cast = value as Partial<MapTileRegionState>;
      const next: MapTileRegionState = {
        spaceUsed: toIntOrUndef(cast.spaceUsed),
        spaceCap: toIntOrUndef(cast.spaceCap),
        satisfaction: toIntOrUndef(cast.satisfaction),
        threat: toIntOrUndef(cast.threat),
        pollution: toIntOrUndef(cast.pollution),
      };
      if (
        next.spaceUsed !== undefined ||
        next.spaceCap !== undefined ||
        next.satisfaction !== undefined ||
        next.threat !== undefined ||
        next.pollution !== undefined
      ) {
        out[key] = next;
      }
    }

    return out;
  }

  private normalizeBuildingLines(input: unknown): BuildingPresetLine[] {
    if (!Array.isArray(input)) return [];
    const out: BuildingPresetLine[] = [];
    const seen = new Set<string>();
    for (const entry of input) {
      const line = entry as Partial<BuildingPresetLine> | null | undefined;
      const text = String(line?.text ?? '').trim();
      if (!text) continue;
      const id = String(line?.id ?? '').trim() || randomUUID();
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ id, text });
    }
    return out;
  }

  private normalizeBuildingPresetsInput(input: unknown): BuildingPreset[] {
    if (!Array.isArray(input)) return [];
    const out: BuildingPreset[] = [];
    const seen = new Set<string>();
    for (const entry of input) {
      const cast = entry as Partial<BuildingPreset> | null | undefined;
      const id = String(cast?.id ?? '').trim() || randomUUID();
      const name = String(cast?.name ?? '').trim();
      if (!name || seen.has(id)) continue;
      seen.add(id);
      const color = this.normalizeHexColor(cast?.color);
      const toPosIntOrUndef = (v: unknown) => {
        if (v == null || String(v).trim() === '') return undefined;
        const n = Math.trunc(Number(v));
        if (!Number.isFinite(n)) return undefined;
        return Math.max(0, n);
      };
      const tier = String(cast?.tier ?? '').trim() || undefined;
      const description = String(cast?.description ?? '').trim() || undefined;
      const normalized: BuildingPreset = {
        id,
        name,
        color,
        tier,
        effort: toPosIntOrUndef(cast?.effort),
        space: toPosIntOrUndef(cast?.space),
        description,
        buildCosts: this.normalizeBuildingLines(cast?.buildCosts),
        researchCosts: this.normalizeBuildingLines(cast?.researchCosts),
        upkeep: this.normalizeBuildingLines(cast?.upkeep),
        dailyEffects: this.normalizeBuildingLines(cast?.dailyEffects),
        requirements: this.normalizeBuildingLines(cast?.requirements),
        notes: this.normalizeBuildingLines(cast?.notes),
      };
      out.push(normalized);
    }
    return out;
  }

  private normalizeCityGlobalInput(input: any): CityGlobalState {
    const valuesIn = input?.values ?? {};
    const capsIn = input?.caps ?? {};
    const overflowToGoldIn = input?.overflowToGold ?? {};
    const dayIn = input?.day;
    const satisfactionIn = input?.satisfaction;
    const populationIn = input?.population ?? {};
    const warehouseIn =
      input?.warehouse && typeof input.warehouse === 'object'
        ? (input.warehouse as Record<string, unknown>)
        : {};
    const toIntSafe = (v: unknown, fallback: number) => {
      const n = Math.trunc(Number(v));
      if (!Number.isFinite(n)) return fallback;
      return Math.max(0, n);
    };
    const normalizeTrackedPopulation = (id: PopulationTrackedId) => {
      const entry = populationIn?.[id] ?? {};
      const total = toIntSafe(entry.total, DEFAULT_CITY_GLOBAL.population[id].total);
      const available = Math.min(
        total,
        toIntSafe(
          entry.available,
          DEFAULT_CITY_GLOBAL.population[id].available ?? 0,
        ),
      );
      return { total, available };
    };
    const population: CityPopulationState = {
      settlers: normalizeTrackedPopulation('settlers'),
      engineers: normalizeTrackedPopulation('engineers'),
      scholars: normalizeTrackedPopulation('scholars'),
      laborers: normalizeTrackedPopulation('laborers'),
      elderly: (() => {
        const total = toIntSafe(
          populationIn?.elderly?.total,
          DEFAULT_CITY_GLOBAL.population.elderly.total,
        );
        const hasAvailable =
          populationIn?.elderly != null &&
          Object.prototype.hasOwnProperty.call(populationIn.elderly, 'available');
        const fallbackAvailable = hasAvailable
          ? (DEFAULT_CITY_GLOBAL.population.elderly as any).available ?? 0
          : total;
        const available = Math.min(
          total,
          toIntSafe(populationIn?.elderly?.available, fallbackAvailable),
        );
        return { total, available };
      })(),
    };
    const totalPopulation =
      population.settlers.total +
      population.engineers.total +
      population.scholars.total +
      population.laborers.total +
      population.elderly.total;
    const populationCap = Math.max(
      totalPopulation,
      toIntSafe(input?.populationCap, totalPopulation),
    );
    return {
      values: {
        wood: toIntSafe(valuesIn.wood, DEFAULT_CITY_GLOBAL.values.wood),
        stone: toIntSafe(valuesIn.stone, DEFAULT_CITY_GLOBAL.values.stone),
        fabric: toIntSafe(valuesIn.fabric, DEFAULT_CITY_GLOBAL.values.fabric),
        weave: toIntSafe(valuesIn.weave, DEFAULT_CITY_GLOBAL.values.weave),
        food: toIntSafe(valuesIn.food, DEFAULT_CITY_GLOBAL.values.food),
        research: toIntSafe(valuesIn.research, DEFAULT_CITY_GLOBAL.values.research),
        order: toIntSafe(valuesIn.order, DEFAULT_CITY_GLOBAL.values.order),
        gold: toIntSafe(valuesIn.gold, DEFAULT_CITY_GLOBAL.values.gold),
      },
      caps: {
        wood: toIntSafe(capsIn.wood, DEFAULT_CITY_GLOBAL.caps.wood),
        stone: toIntSafe(capsIn.stone, DEFAULT_CITY_GLOBAL.caps.stone),
        fabric: toIntSafe(capsIn.fabric, DEFAULT_CITY_GLOBAL.caps.fabric),
        weave: toIntSafe(capsIn.weave, DEFAULT_CITY_GLOBAL.caps.weave),
        food: toIntSafe(capsIn.food, DEFAULT_CITY_GLOBAL.caps.food),
      },
      overflowToGold: {
        wood: toIntSafe(overflowToGoldIn.wood, DEFAULT_CITY_GLOBAL.overflowToGold.wood),
        stone: toIntSafe(overflowToGoldIn.stone, DEFAULT_CITY_GLOBAL.overflowToGold.stone),
        fabric: toIntSafe(overflowToGoldIn.fabric, DEFAULT_CITY_GLOBAL.overflowToGold.fabric),
        weave: toIntSafe(overflowToGoldIn.weave, DEFAULT_CITY_GLOBAL.overflowToGold.weave),
        food: toIntSafe(overflowToGoldIn.food, DEFAULT_CITY_GLOBAL.overflowToGold.food),
      },
      warehouse: (() => {
        const out: Record<string, number> = {};
        for (const [nameRaw, amountRaw] of Object.entries(warehouseIn)) {
          const name = String(nameRaw ?? '').trim();
          if (!name) continue;
          const amount = toIntSafe(amountRaw, 0);
          if (amount <= 0) continue;
          out[name] = amount;
        }
        return out;
      })(),
      day: toIntSafe(dayIn, DEFAULT_CITY_GLOBAL.day),
      satisfaction: toIntSafe(satisfactionIn, DEFAULT_CITY_GLOBAL.satisfaction),
      populationCap,
      population,
    };
  }

  private async requireReadable(user: AuthUser, id: string) {
    const row = await this.prisma.worldMap.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('world map not found');
    if (!user.isAdmin && row.ownerId !== user.id) {
      throw new ForbiddenException('forbidden');
    }
    return row;
  }

  private async requireWritable(user: AuthUser, id: string) {
    const row = await this.prisma.worldMap.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('world map not found');
    if (!user.isAdmin && row.ownerId !== user.id) {
      throw new ForbiddenException('forbidden');
    }
    return row;
  }

  private toNumber(value: unknown, label: string): number {
    const num = Number(value);
    if (!Number.isFinite(num)) {
      throw new BadRequestException(`${label} must be a number`);
    }
    return num;
  }

  private toInt(value: unknown, label: string, min: number, max: number): number {
    const num = Math.trunc(Number(value));
    if (!Number.isFinite(num) || num < min || num > max) {
      throw new BadRequestException(`${label} out of range`);
    }
    return num;
  }

  private toNumberRange(value: unknown, label: string, min: number, max: number): number {
    const num = Number(value);
    if (!Number.isFinite(num) || num < min || num > max) {
      throw new BadRequestException(`${label} out of range`);
    }
    return num;
  }
}


