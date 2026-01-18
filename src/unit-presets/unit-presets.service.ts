import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  CreateUnitPresetDto,
  CreateUnitPresetFolderDto,
  UpdateUnitPresetDto,
  UpdateUnitPresetFolderDto,
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

@Injectable()
export class UnitPresetsService {
  constructor(private readonly prisma: PrismaClient) {}

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
}
