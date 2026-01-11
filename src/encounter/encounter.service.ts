//src/encounter/encounter.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';

import type { EncounterState, Action } from './encounter.types';
import { applyAction, applyActions } from './encounter.actions';
import { renderAnsi } from './encounter.render';
import { buildDemoEncounter } from './encounter.seed';

const MAX_UNDO = 50;

@Injectable()
export class EncounterService {
  private store = new Map<string, EncounterState>();
  private dataDir = process.env.COMBAT_DATA_DIR ?? './data';

  private undoStore = new Map<string, EncounterState[]>();

  async get(id: string): Promise<EncounterState> {
    const cached = this.store.get(id);
    if (cached) return cached;

    const loaded = await this.tryLoad(id);
    if (loaded) {
      const { next: migrated, changed } = this.ensurePositions(loaded);

      this.store.set(id, migrated);

      // 한번이라도 바뀌었으면 파일도 갱신 저장(다음부터는 마이그레이션 필요 없음)
      if (changed) await this.save(id, migrated);

      return migrated;
    }

    // 없으면 기본 생성
    const fresh: EncounterState =
      id === 'demo'
        ? buildDemoEncounter()
        : {
            id,
            units: [],
            markers: [],
            turnOrder: [],
            turnIndex: 0,
            round: 1,
            updatedAt: new Date().toISOString(),
          };

    this.store.set(id, fresh);
    await this.save(id, fresh);
    return fresh;
  }

  async apply(id: string, body: Action | Action[]): Promise<EncounterState> {
    const cur = await this.get(id);

    // undo용 "적용 전" 스냅샷
    const prevSnapshot: EncounterState = structuredClone(cur);

    // next 계산 (여기서 로그도 next에 쌓임)
    const next = Array.isArray(body)
      ? applyActions(cur, body)
      : applyAction(cur, body);

    // 저장 성공 후에만 커밋
    await this.save(id, next);
    this.store.set(id, next);

    this.pushUndo(id, prevSnapshot);
    return next;
  }

  // ✅ 새 엔드포인트에서 호출할 undo
  async undo(id: string): Promise<EncounterState> {
    const stack = this.undoStore.get(id);
    if (!stack || stack.length === 0) {
      throw new BadRequestException('undo할 기록이 없습니다.');
    }

    const prev = stack.pop()!;

    // undo도 "상태 변화"니까 updatedAt은 갱신하는 걸 추천
    prev.updatedAt = new Date().toISOString();

    await this.save(id, prev);
    this.store.set(id, prev);
    return prev;
  }

  render(idState: EncounterState): string {
    return renderAnsi(idState);
  }

  private pushUndo(id: string, prev: EncounterState) {
    const stack = this.undoStore.get(id) ?? [];
    stack.push(prev);

    if (stack.length > MAX_UNDO) {
      stack.splice(0, stack.length - MAX_UNDO);
    }

    this.undoStore.set(id, stack);
  }

  private async tryLoad(id: string): Promise<EncounterState | null> {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      const file = path.join(this.dataDir, `${id}.json`);
      const raw = await fs.readFile(file, 'utf8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private async save(id: string, state: EncounterState) {
    await fs.mkdir(this.dataDir, { recursive: true });
    const file = path.join(this.dataDir, `${id}.json`);
    await fs.writeFile(file, JSON.stringify(state, null, 2), 'utf8');
  }

  async setDefaultPublishChannel(id: string, channelId: string) {
    const cur = await this.get(id);
    const next = {
      ...cur,
      publish: { ...(cur.publish ?? {}), channelId },
      updatedAt: new Date().toISOString(),
    };
    this.store.set(id, next);
    await this.save(id, next); // 네 save가 private면 내부에서만 호출 가능하니 OK
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

    // ✅ turnOrder에서 존재하지 않는 유닛 참조 제거
    const unitIds = new Set((next.units ?? []).map((u) => u.id));
    const beforeLen = (next as any).turnOrder.length;

    (next as any).turnOrder = (next as any).turnOrder.filter((t: any) => {
      if (t?.kind === 'label') return true;
      if (t?.kind === 'unit') return unitIds.has(t.unitId);
      return false;
    });

    if ((next as any).turnOrder.length !== beforeLen) changed = true;

    // ✅ turnIndex 보정: "유닛만 턴 주체" (label이면 첫 유닛으로)
    const order = (next as any).turnOrder as any[];
    const unitIdxs = order
      .map((t, i) => (t?.kind === 'unit' ? i : -1))
      .filter((i) => i >= 0);

    const rawTi = Math.floor((next as any).turnIndex ?? 0);

    if (unitIdxs.length === 0) {
      // 유닛이 없으면 0
      if ((next as any).turnIndex !== 0) {
        (next as any).turnIndex = 0;
        changed = true;
      }
    } else {
      // 유닛이 있으면 "유닛 인덱스"로 보정
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

    // (선택) formationLines 제거
    if ((next as any).formationLines !== undefined) {
      delete (next as any).formationLines;
      changed = true;
    }

    if (changed) next.updatedAt = new Date().toISOString();
    return { next, changed };
  }

  coerceTurnIndexToUnitOnly(order: any[], start: number): number {
    if (!Array.isArray(order) || order.length === 0) return 0;

    // 유닛 엔트리 인덱스 목록
    const unitIdxs: number[] = [];
    for (let i = 0; i < order.length; i++) {
      if (order[i]?.kind === 'unit') unitIdxs.push(i);
    }
    if (unitIdxs.length === 0) return 0;

    // start 범위 보정
    const s = Number.isFinite(start)
      ? Math.max(0, Math.min(order.length - 1, start))
      : 0;

    // start부터 뒤로 유닛 찾기
    for (let i = s; i < order.length; i++) {
      if (order[i]?.kind === 'unit') return i;
    }

    // 없으면 첫 유닛으로 wrap
    return unitIdxs[0];
  }
}
