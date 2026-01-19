import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { DiceService } from '../dice/dice.service';
import {
  CreateUnitPresetDto,
  CreateUnitPresetFolderDto,
  UpdateUnitPresetDto,
  UpdateUnitPresetFolderDto,
  ValidateHpFormulaDto,
} from './unit-presets.dto';

const DEFAULT_FOLDER_NAME = 'Untitled Folder';
const DEFAULT_PRESET_NAME = 'Untitled Preset';

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function normalizeName(value: unknown, fallback: string): string {
  const name = String(value ?? '').trim();
  return name.length ? name : fallback;
}

function normalizeOrder(value: unknown): number | undefined {
  const num = Math.trunc(Number(value));
  if (!Number.isFinite(num)) return undefined;
  return num;
}

function extractHpFormulaParams(expr: string) {
  const out = new Set<string>();
  const regex = /\{([^}]+)\}/g;
  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(expr))) {
    const name = String(match[1] ?? '').trim();
    if (name) out.add(name);
  }
  return Array.from(out);
}

@Injectable()
export class UnitPresetsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly dice: DiceService,
  ) {}

  async list(userId: string) {
    const [folders, presets] = await this.prisma.$transaction([
      this.prisma.unitPresetFolder.findMany({
        where: { ownerId: userId },
        orderBy: [{ order: 'asc' }, { updatedAt: 'desc' }],
      }),
      this.prisma.unitPreset.findMany({
        where: { ownerId: userId },
        orderBy: [{ order: 'asc' }, { updatedAt: 'desc' }],
      }),
    ]);

    return { folders, presets };
  }

  async createFolder(userId: string, body: CreateUnitPresetFolderDto) {
    const name = normalizeName(body?.name, DEFAULT_FOLDER_NAME);
    const order = normalizeOrder(body?.order);
    const parentId = body?.parentId ?? null;

    if (parentId) {
      const parent = await this.prisma.unitPresetFolder.findFirst({
        where: { id: parentId, ownerId: userId },
        select: { id: true },
      });
      if (!parent) throw new NotFoundException('parent folder not found');
    }

    return this.prisma.unitPresetFolder.create({
      data: {
        ownerId: userId,
        name,
        order: order ?? 0,
        parentId,
      },
    });
  }

  async updateFolder(
    userId: string,
    id: string,
    body: UpdateUnitPresetFolderDto,
  ) {
    const folder = await this.prisma.unitPresetFolder.findFirst({
      where: { id, ownerId: userId },
    });
    if (!folder) throw new NotFoundException('folder not found');

    const data: { name?: string; order?: number; parentId?: string | null } = {};
    if (body?.name !== undefined) {
      data.name = normalizeName(body?.name, DEFAULT_FOLDER_NAME);
    }
    if (body?.order !== undefined && body?.order !== null) {
      data.order = normalizeOrder(body?.order) ?? folder.order;
    }
    if (body?.parentId !== undefined) {
      const parentId = body?.parentId ?? null;
      if (parentId === folder.id) {
        throw new BadRequestException('cannot set parent to self');
      }
      if (parentId) {
        const parent = await this.prisma.unitPresetFolder.findFirst({
          where: { id: parentId, ownerId: userId },
          select: { id: true },
        });
        if (!parent) throw new NotFoundException('parent folder not found');
      }
      data.parentId = parentId;
    }

    return this.prisma.unitPresetFolder.update({
      where: { id },
      data,
    });
  }

  async deleteFolder(userId: string, id: string) {
    const folder = await this.prisma.unitPresetFolder.findFirst({
      where: { id, ownerId: userId },
      select: { id: true },
    });
    if (!folder) throw new NotFoundException('folder not found');

    await this.prisma.unitPresetFolder.delete({ where: { id } });
    return { ok: true };
  }

  async createPreset(userId: string, body: CreateUnitPresetDto) {
    const name = normalizeName(body?.name, DEFAULT_PRESET_NAME);
    const folderId = body?.folderId ?? null;
    const order = normalizeOrder(body?.order);

    if (folderId) {
      const folder = await this.prisma.unitPresetFolder.findFirst({
        where: { id: folderId, ownerId: userId },
        select: { id: true },
      });
      if (!folder) throw new NotFoundException('folder not found');
    }

    return this.prisma.unitPreset.create({
      data: {
        ownerId: userId,
        folderId,
        name,
        order: order ?? 0,
        data: asJson(body?.data ?? {}),
      },
    });
  }

  async updatePreset(userId: string, id: string, body: UpdateUnitPresetDto) {
    const preset = await this.prisma.unitPreset.findFirst({
      where: { id, ownerId: userId },
    });
    if (!preset) throw new NotFoundException('preset not found');

    let folderId = preset.folderId ?? null;
    let order = preset.order ?? 0;
    if (body?.folderId !== undefined) {
      folderId = body.folderId ?? null;
      if (folderId) {
        const folder = await this.prisma.unitPresetFolder.findFirst({
          where: { id: folderId, ownerId: userId },
          select: { id: true },
        });
        if (!folder) throw new NotFoundException('folder not found');
      }
    }
    if (body?.order !== undefined && body?.order !== null) {
      order = normalizeOrder(body?.order) ?? order;
    }

    const data: {
      name?: string;
      folderId?: string | null;
      order?: number;
      data?: Prisma.InputJsonValue;
    } = {};

    if (body?.name !== undefined) {
      data.name = normalizeName(body?.name, DEFAULT_PRESET_NAME);
    }
    if (body?.folderId !== undefined) {
      data.folderId = folderId;
    }
    if (body?.order !== undefined) {
      data.order = order;
    }
    if (body?.data !== undefined) {
      data.data = asJson(body?.data ?? {});
    }

    return this.prisma.unitPreset.update({
      where: { id },
      data,
    });
  }

  async deletePreset(userId: string, id: string) {
    const preset = await this.prisma.unitPreset.findFirst({
      where: { id, ownerId: userId },
      select: { id: true },
    });
    if (!preset) throw new NotFoundException('preset not found');

    await this.prisma.unitPreset.delete({ where: { id } });
    return { ok: true };
  }

  async validateHpFormula(body: ValidateHpFormulaDto) {
    const expr = String(body?.expr ?? '').trim();
    if (!expr) throw new BadRequestException('HP 공식이 비어 있습니다.');

    const params: Record<string, number> = {};
    for (const [key, value] of Object.entries(body?.params ?? {})) {
      const name = String(key ?? '').trim();
      if (!name) continue;
      const num = Number(value);
      if (!Number.isFinite(num)) {
        throw new BadRequestException(
          `HP 공식 파라미터 "${name}" 값이 숫자가 아닙니다.`,
        );
      }
      params[name] = num;
    }

    const required = extractHpFormulaParams(expr);
    const missing = required.filter((name) => params[name] === undefined);
    if (missing.length > 0) {
      throw new BadRequestException(
        `HP 공식 파라미터가 누락되었습니다: ${missing.join(', ')}`,
      );
    }

    const resolved = expr.replace(/\{([^}]+)\}/g, (_raw, keyRaw) => {
      const key = String(keyRaw ?? '').trim();
      if (!key) {
        throw new BadRequestException('HP 공식의 파라미터 이름이 비어 있습니다.');
      }
      if (params[key] === undefined) {
        throw new BadRequestException(
          `HP 공식 파라미터가 누락되었습니다: ${key}`,
        );
      }
      return String(params[key]);
    });

    let result: number;
    try {
      result = this.dice.rollExpression(resolved).total;
    } catch (err: any) {
      throw new BadRequestException(
        `HP 공식이 유효하지 않습니다: ${err?.message ?? err}`,
      );
    }
    if (!Number.isFinite(result)) {
      throw new BadRequestException('HP 공식 계산 결과가 숫자가 아닙니다.');
    }

    const minRaw = body?.min;
    const maxRaw = body?.max;
    const min = Number(minRaw);
    const max = Number(maxRaw);
    if (minRaw !== undefined && !Number.isFinite(min)) {
      throw new BadRequestException('HP 공식 최소값이 숫자가 아닙니다.');
    }
    if (maxRaw !== undefined && !Number.isFinite(max)) {
      throw new BadRequestException('HP 공식 최대값이 숫자가 아닙니다.');
    }
    if (Number.isFinite(min) && Number.isFinite(max) && min > max) {
      throw new BadRequestException(
        'HP 공식 최소값이 최대값보다 클 수 없습니다.',
      );
    }

    let value = result;
    if (Number.isFinite(min)) value = Math.max(value, min);
    if (Number.isFinite(max)) value = Math.min(value, max);

    value = Math.round(value);
    return { ok: true, value };
  }
}
