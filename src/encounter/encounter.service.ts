//src/encounter/encounter.service.ts
import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';

import type { EncounterState, Action } from './encounter.types';
import { applyAction, applyActions } from './encounter.actions';
import { renderAnsi } from './encounter.render';
import { buildDemoEncounter } from './encounter.seed';

@Injectable()
export class EncounterService {
  private store = new Map<string, EncounterState>();
  private dataDir = process.env.COMBAT_DATA_DIR ?? './data';

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
            updatedAt: new Date().toISOString(),
          };

    this.store.set(id, fresh);
    await this.save(id, fresh);
    return fresh;
  }

  async apply(id: string, body: Action | Action[]): Promise<EncounterState> {
    const cur = await this.get(id);

    const next = Array.isArray(body)
      ? applyActions(cur, body)
      : applyAction(cur, body);

    this.store.set(id, next);
    await this.save(id, next);
    return next;
  }

  render(idState: EncounterState): string {
    return renderAnsi(idState);
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

    // markers 기본값 보정
    if (!Array.isArray((next as any).markers)) {
      (next as any).markers = [];
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

    // (선택) formationLines는 이제 안 쓰니 제거해도 됨
    if ((next as any).formationLines !== undefined) {
      delete (next as any).formationLines;
      changed = true;
    }

    if (changed) next.updatedAt = new Date().toISOString();
    return { next, changed };
  }
}
