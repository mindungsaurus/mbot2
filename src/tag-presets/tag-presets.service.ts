import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type {
  CreateTagPresetDto,
  CreateTagPresetFolderDto,
  TagPresetKind,
  UpdateTagPresetDto,
  UpdateTagPresetFolderDto,
} from './tag-presets.dto';

const DEFAULT_TAG_NAME = 'Untitled Tag';
const DEFAULT_FOLDER_NAME = 'Untitled Folder';

function normalizeName(value: unknown, fallback: string): string {
  const name = String(value ?? '').trim();
  return name.length ? name : fallback;
}

function normalizeKind(value: unknown): TagPresetKind {
  return value === 'stack' ? 'stack' : 'toggle';
}

function normalizeBool(value: unknown, fallback = false): boolean {
  if (value === true) return true;
  if (value === false) return false;
  return fallback;
}

function normalizeOrder(value: unknown): number | undefined {
  const num = Math.trunc(Number(value));
  if (!Number.isFinite(num)) return undefined;
  return num;
}

function normalizeColorCode(value: unknown): number | null {
  if (value === null) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.trunc(num);
}

@Injectable()
export class TagPresetsService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(userId: string) {
    const [folders, presets] = await this.prisma.$transaction([
      this.prisma.tagPresetFolder.findMany({
        where: { ownerId: userId },
        orderBy: [{ order: 'asc' }, { updatedAt: 'desc' }],
      }),
      this.prisma.tagPreset.findMany({
        where: { ownerId: userId },
        orderBy: [{ order: 'asc' }, { updatedAt: 'desc' }],
      }),
    ]);
    return { folders, presets };
  }

  async createFolder(userId: string, body: CreateTagPresetFolderDto) {
    const name = normalizeName(body?.name, DEFAULT_FOLDER_NAME);
    const order = normalizeOrder(body?.order);
    const parentId = body?.parentId ?? null;

    if (parentId) {
      const parent = await this.prisma.tagPresetFolder.findFirst({
        where: { id: parentId, ownerId: userId },
        select: { id: true },
      });
      if (!parent) throw new NotFoundException('parent folder not found');
    }

    return this.prisma.tagPresetFolder.create({
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
    body: UpdateTagPresetFolderDto,
  ) {
    const folder = await this.prisma.tagPresetFolder.findFirst({
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
        const parent = await this.prisma.tagPresetFolder.findFirst({
          where: { id: parentId, ownerId: userId },
          select: { id: true },
        });
        if (!parent) throw new NotFoundException('parent folder not found');
      }
      data.parentId = parentId;
    }

    return this.prisma.tagPresetFolder.update({
      where: { id },
      data,
    });
  }

  async deleteFolder(userId: string, id: string) {
    const folder = await this.prisma.tagPresetFolder.findFirst({
      where: { id, ownerId: userId },
      select: { id: true },
    });
    if (!folder) throw new NotFoundException('folder not found');

    await this.prisma.tagPresetFolder.delete({ where: { id } });
    return { ok: true };
  }

  async create(userId: string, body: CreateTagPresetDto) {
    const name = normalizeName(body?.name, DEFAULT_TAG_NAME);
    const kind = normalizeKind(body?.kind);
    const folderId = body?.folderId ?? null;
    const order = normalizeOrder(body?.order);
    const colorCode = normalizeColorCode(body?.colorCode);
    const decOnTurnStart = kind === 'stack' && normalizeBool(body?.decOnTurnStart);
    const decOnTurnEnd = kind === 'stack' && normalizeBool(body?.decOnTurnEnd);

    if (folderId) {
      const folder = await this.prisma.tagPresetFolder.findFirst({
        where: { id: folderId, ownerId: userId },
        select: { id: true },
      });
      if (!folder) throw new NotFoundException('folder not found');
    }

    return this.prisma.tagPreset.create({
      data: {
        ownerId: userId,
        folderId,
        name,
        order: order ?? 0,
        kind,
        decOnTurnStart,
        decOnTurnEnd,
        colorCode,
      },
    });
  }

  async update(userId: string, id: string, body: UpdateTagPresetDto) {
    const preset = await this.prisma.tagPreset.findFirst({
      where: { id, ownerId: userId },
    });
    if (!preset) throw new NotFoundException('preset not found');

    let folderId = preset.folderId ?? null;
    let order = preset.order ?? 0;
    if (body?.folderId !== undefined) {
      folderId = body.folderId ?? null;
      if (folderId) {
        const folder = await this.prisma.tagPresetFolder.findFirst({
          where: { id: folderId, ownerId: userId },
          select: { id: true },
        });
        if (!folder) throw new NotFoundException('folder not found');
      }
    }
    if (body?.order !== undefined && body?.order !== null) {
      order = normalizeOrder(body?.order) ?? order;
    }

    const nextKind =
      body?.kind !== undefined ? normalizeKind(body.kind) : normalizeKind(preset.kind);
    const nextDecStart =
      body?.decOnTurnStart !== undefined
        ? normalizeBool(body.decOnTurnStart)
        : preset.decOnTurnStart;
    const nextDecEnd =
      body?.decOnTurnEnd !== undefined
        ? normalizeBool(body.decOnTurnEnd)
        : preset.decOnTurnEnd;

    return this.prisma.tagPreset.update({
      where: { id },
      data: {
        name:
          body?.name !== undefined
            ? normalizeName(body.name, DEFAULT_TAG_NAME)
            : preset.name,
        folderId,
        order,
        kind: nextKind,
        decOnTurnStart: nextKind === 'stack' ? nextDecStart : false,
        decOnTurnEnd: nextKind === 'stack' ? nextDecEnd : false,
        colorCode: body?.colorCode !== undefined ? normalizeColorCode(body.colorCode) : preset.colorCode,
      },
    });
  }

  async delete(userId: string, id: string) {
    const preset = await this.prisma.tagPreset.findFirst({
      where: { id, ownerId: userId },
      select: { id: true },
    });
    if (!preset) throw new NotFoundException('preset not found');
    await this.prisma.tagPreset.delete({ where: { id } });
    return { ok: true };
  }
}
