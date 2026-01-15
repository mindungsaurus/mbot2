//src/encounter/encounter.service.ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

import type { EncounterState, Action } from './encounter.types';
import { applyAction, applyActions } from './encounter.actions';
import { renderAnsi } from './encounter.render';

const MAX_UNDO = 50;

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

@Injectable()
export class EncounterService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(userId: string) {
    return this.prisma.encounter.findMany({
      where: { ownerId: userId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, name: true, updatedAt: true },
    });
  }

  async create(userId: string, name?: string): Promise<EncounterState> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const title = (name ?? '').trim() || `Encounter ${id.slice(0, 8)}`;

    const state: EncounterState = {
      id,
      units: [],
      markers: [],
      turnOrder: [],
      turnIndex: 0,
      round: 1,
      updatedAt: now,
    };

    await this.prisma.encounter.create({
      data: {
        id,
        ownerId: userId,
        name: title,
        state: asJson(state),
      },
    });

    return state;
  }

  async get(userId: string, id: string): Promise<EncounterState> {
    const row = await this.prisma.encounter.findFirst({
      where: { id, ownerId: userId },
    });
    if (!row) throw new NotFoundException('encounter not found');

    const raw = row.state as unknown as EncounterState;
    const { next, changed } = this.ensurePositions(raw);
    if (next.id !== id) {
      next.id = id;
      next.updatedAt = new Date().toISOString();
    }

    if (changed) {
      await this.prisma.encounter.update({
        where: { id },
        data: { state: asJson(next) },
      });
    }

    return next;
  }

  async apply(
    userId: string,
    id: string,
    body: Action | Action[],
  ): Promise<EncounterState> {
    const row = await this.prisma.encounter.findFirst({
      where: { id, ownerId: userId },
    });
    if (!row) throw new NotFoundException('encounter not found');

    const cur = row.state as unknown as EncounterState;
    cur.id = id;

    const prevSnapshot: EncounterState = structuredClone(cur);

    const next = Array.isArray(body)
      ? applyActions(cur, body)
      : applyAction(cur, body);

    next.id = id;
    next.updatedAt = new Date().toISOString();

    await this.prisma.$transaction(async (tx) => {
      await tx.encounterUndo.create({
        data: { encounterId: id, state: asJson(prevSnapshot) },
      });
      await tx.encounter.update({ where: { id }, data: { state: asJson(next) } });

      const count = await tx.encounterUndo.count({
        where: { encounterId: id },
      });
      if (count > MAX_UNDO) {
        const old = await tx.encounterUndo.findMany({
          where: { encounterId: id },
          orderBy: { createdAt: 'asc' },
          take: count - MAX_UNDO,
          select: { id: true },
        });
        if (old.length) {
          await tx.encounterUndo.deleteMany({
            where: { id: { in: old.map((o) => o.id) } },
          });
        }
      }
    });

    return next;
  }

  async undo(userId: string, id: string): Promise<EncounterState> {
    const row = await this.prisma.encounter.findFirst({
      where: { id, ownerId: userId },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('encounter not found');

    const last = await this.prisma.encounterUndo.findFirst({
      where: { encounterId: id },
      orderBy: { createdAt: 'desc' },
    });
    if (!last) {
      throw new BadRequestException('undo할 기록이 없습니다.');
    }

    const prev = last.state as unknown as EncounterState;
    prev.id = id;
    prev.updatedAt = new Date().toISOString();

    await this.prisma.$transaction(async (tx) => {
      await tx.encounter.update({ where: { id }, data: { state: asJson(prev) } });
      await tx.encounterUndo.delete({ where: { id: last.id } });
    });

    return prev;
  }

  render(idState: EncounterState): string {
    return renderAnsi(idState);
  }

  async setDefaultPublishChannel(userId: string, id: string, channelId: string) {
    const cur = await this.get(userId, id);
    const next = {
      ...cur,
      publish: { ...(cur.publish ?? {}), channelId },
      updatedAt: new Date().toISOString(),
    };
    await this.prisma.encounter.update({
      where: { id },
      data: { state: asJson(next) },
    });
    return next;
  }

  ensurePositions(state: EncounterState): {
    next: EncounterState;
    changed: boolean;
  } {
    let changed = false;
    const next: EncounterState = structuredClone(state);

    // markers 기본값
    if (!Array.isArray((next as any).markers)) {
      (next as any).markers = [];
      changed = true;
    }

    // round 기본값(1 이상)
    const round = Math.floor((next as any).round ?? 0);
    if (!Number.isFinite(round) || round < 1) {
      (next as any).round = 1;
      changed = true;
    }

    // turnOrder 기본값
    if (!Array.isArray((next as any).turnOrder)) {
      (next as any).turnOrder = [];
      changed = true;
    }

    // pos 없는 유닛 자동 배치: z=0, x는 0부터 순서대로
    let xCursor = 0;
    for (const u of next.units ?? []) {
      if (!u.pos) {
        u.pos = { x: xCursor, z: 0 };
        xCursor += 1;
        changed = true;
      }
    }

    // turnOrder에서 존재하지 않는 유닛/마커 참조 제거
    const unitIds = new Set((next.units ?? []).map((u) => u.id));
    const markerIds = new Set((next.markers ?? []).map((m: any) => m.id));
    const beforeLen = (next as any).turnOrder.length;

    (next as any).turnOrder = (next as any).turnOrder.filter((t: any) => {
      if (t?.kind === 'label') return true;
      if (t?.kind === 'unit') return unitIds.has(t.unitId);
      if (t?.kind === 'marker') return markerIds.has(t.markerId);
      return false;
    });

    if ((next as any).turnOrder.length !== beforeLen) changed = true;

    // turnIndex 보정: "유닛만 턴 주체" (label이면 첫 유닛으로)
    const order = (next as any).turnOrder as any[];
    const unitIdxs = order
      .map((t, i) => (t?.kind === 'unit' ? i : -1))
      .filter((i) => i >= 0);

    const rawTi = Math.floor((next as any).turnIndex ?? 0);

    if (unitIdxs.length === 0) {
      if ((next as any).turnIndex !== 0) {
        (next as any).turnIndex = 0;
        changed = true;
      }
    } else {
      if (
        !Number.isFinite(rawTi) ||
        rawTi < 0 ||
        rawTi >= order.length ||
        order[rawTi]?.kind !== 'unit'
      ) {
        (next as any).turnIndex = unitIdxs[0];
        changed = true;
      }
    }

    // legacy formationLines 제거
    if ((next as any).formationLines !== undefined) {
      delete (next as any).formationLines;
      changed = true;
    }

    if (changed) next.updatedAt = new Date().toISOString();
    return { next, changed };
  }

  coerceTurnIndexToUnitOnly(order: any[], start: number): number {
    if (!Array.isArray(order) || order.length === 0) return 0;

    const unitIdxs: number[] = [];
    for (let i = 0; i < order.length; i++) {
      if (order[i]?.kind === 'unit') unitIdxs.push(i);
    }
    if (unitIdxs.length === 0) return 0;

    const s = Number.isFinite(start)
      ? Math.max(0, Math.min(order.length - 1, start))
      : 0;

    for (let i = s; i < order.length; i++) {
      if (order[i]?.kind === 'unit') return i;
    }

    return unitIdxs[0];
  }
}
