import {
  Action,
  EncounterState,
  Unit,
  UnitPatch,
  NumPatch,
  UnitMod,
} from './encounter.types';
import {
  getComputedIntegrity,
  getBaseAc,
  getBaseIntegrity,
} from './encounter.compute';
import { getPreset } from './encounter.presets';

const MAX_STACKS_GLOBAL = 999;
const MAX_ABS_POS = 10000;

function normPos(v: any): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return 0;
  return Math.max(-MAX_ABS_POS, Math.min(MAX_ABS_POS, n));
}

export function applyAction(
  state: EncounterState,
  action: Action,
): EncounterState {
  const next: EncounterState = structuredClone(state);
  applyActionInPlace(next, action);
  return touch(next);
}

export function applyActions(
  state: EncounterState,
  actions: Action[],
): EncounterState {
  const next: EncounterState = structuredClone(state);
  for (const a of actions) applyActionInPlace(next, a);
  return touch(next);
}

export function applyActionInPlace(
  state: EncounterState,
  action: Action,
): void {
  switch (action.type) {
    case 'APPLY_DAMAGE': {
      const u = findUnit(state, action.unitId);
      normalizeUnit(u);
      if (!u.hp) return;

      const amount = Math.max(0, Math.floor(action.amount));
      const integrity = getComputedIntegrity(u) ?? 0;

      if (integrity > 0 && amount < integrity) return;

      let remaining = amount;

      const temp = u.hp.temp ?? 0;
      if (temp > 0) {
        const used = Math.min(temp, remaining);
        const newTemp = temp - used;
        remaining -= used;
        if (newTemp > 0) u.hp.temp = newTemp;
        else delete u.hp.temp;
      }

      if (remaining > 0) u.hp.cur = Math.max(0, u.hp.cur - remaining);
      return;
    }

    case 'HEAL': {
      const u = findUnit(state, action.unitId);
      normalizeUnit(u);
      if (!u.hp) return;

      const amount = Math.max(0, Math.floor(action.amount));
      u.hp.cur = Math.min(u.hp.max, Math.max(0, u.hp.cur + amount));
      return;
    }

    case 'SET_TEMP_HP': {
      const u = findUnit(state, action.unitId);
      normalizeUnit(u);
      if (!u.hp) return;

      const temp = Math.max(0, Math.floor(action.temp));
      const mode = action.mode ?? 'normal';

      const curTemp = u.hp.temp ?? 0;

      if (mode === 'normal') {
        // ✅ 룰: 더 큰 값만 갱신, 0으로 삭제는 force에서만
        if (temp === 0) return;
        if (temp <= curTemp) return;
      }

      if (temp <= 0) delete u.hp.temp;
      else u.hp.temp = temp;
      return;
    }

    case 'TOGGLE_TAG': {
      const u = findUnit(state, action.unitId);
      normalizeUnit(u);
      const tag = (action.tag ?? '').trim();
      if (!tag) return;

      const idx = u.tags.findIndex((t) => t === tag);
      if (idx >= 0) u.tags.splice(idx, 1);
      else u.tags.push(tag);
      return;
    }

    case 'NEXT_TURN': {
      if (state.turnOrder.length > 0) {
        state.turnIndex = (state.turnIndex + 1) % state.turnOrder.length;
      }
      return;
    }

    case 'PATCH_UNIT': {
      const u = findUnit(state, action.unitId);
      normalizeUnit(u);
      applyUnitPatch(u, action.patch);
      return;
    }

    case 'SET_PRESET': {
      const u = findUnit(state, action.targetUnitId);
      normalizeUnit(u);

      const preset = getPreset(action.presetId);
      const active = isActive(u, preset.id);

      const enabled = action.enabled ?? !active; // 미지정이면 토글

      if (!enabled) {
        removeMod(u, preset.id);
        return;
      }

      // enabled=true
      if (preset.kind === 'toggle') {
        // 토글형은 항상 stacks=1
        const stacks = 1;
        const modBody = preset.buildMod({
          target: u,
          stacks,
          args: action.args,
        });
        upsertMod(u, { key: preset.id, stacks, ...modBody });
        return;
      }

      // stack형: 없으면 defaultStacks로 켬(최소 1)
      const curStacks = active
        ? clampStacks(getStacks(u, preset.id), preset.maxStacks)
        : 0;
      const nextStacks =
        curStacks > 0
          ? curStacks
          : clampStacks(preset.defaultStacks ?? 1, preset.maxStacks);

      const modBody = preset.buildMod({
        target: u,
        stacks: nextStacks,
        args: action.args,
      });
      upsertMod(u, { key: preset.id, stacks: nextStacks, ...modBody });
      return;
    }

    case 'ADJUST_PRESET_STACK': {
      const u = findUnit(state, action.targetUnitId);
      normalizeUnit(u);

      const preset = getPreset(action.presetId);

      // ✅ 토글형에 스택 조작은 의미 없으니 안전하게 no-op
      if (preset.kind !== 'stack') return;

      const delta = Math.floor(action.delta ?? 0);
      if (delta === 0) return;

      const curStacks = clampStacks(getStacks(u, preset.id), preset.maxStacks); // 없으면 0
      const nextStacks = clampStacks(curStacks + delta, preset.maxStacks);

      if (nextStacks <= 0) {
        removeMod(u, preset.id);
        return;
      }

      const modBody = preset.buildMod({
        target: u,
        stacks: nextStacks,
        args: action.args,
      });
      upsertMod(u, { key: preset.id, stacks: nextStacks, ...modBody });
      return;
    }

    case 'SET_UNIT_POS': {
      const u = findUnit(state, action.unitId);
      normalizeUnit(u);

      const x = normPos(action.x);
      const z = normPos(action.z);

      u.pos = { x, z };
      return;
    }

    case 'MOVE_UNIT': {
      const u = findUnit(state, action.unitId);
      normalizeUnit(u);

      const dx = normPos(action.dx ?? 0);
      const dz = normPos(action.dz ?? 0);

      const cur = u.pos ?? { x: 0, z: 0 };
      u.pos = { x: normPos(cur.x + dx), z: normPos(cur.z + dz) };
      return;
    }

    case 'UPSERT_MARKER': {
      const id = (action.markerId ?? '').trim();
      const name = (action.name ?? '').trim();
      if (!id || !name) return;

      const x = normPos(action.x);
      const z = normPos(action.z);

      state.markers ??= [];
      const idx = state.markers.findIndex((m) => m.id === id);
      const m = { id, kind: 'MARKER' as const, name, pos: { x, z } };

      if (idx >= 0) state.markers[idx] = m;
      else state.markers.push(m);

      return;
    }

    case 'REMOVE_MARKER': {
      const id = (action.markerId ?? '').trim();
      if (!id || !state.markers?.length) return;
      const idx = state.markers.findIndex((m) => m.id === id);
      if (idx >= 0) state.markers.splice(idx, 1);
      return;
    }

    default:
      return;
  }
}

// ---------------- helpers ----------------

function touch(s: EncounterState): EncounterState {
  s.updatedAt = new Date().toISOString();
  return s;
}

function findUnit(state: EncounterState, unitId: string): Unit {
  const u = state.units.find((x) => x.id === unitId);
  if (!u) throw new Error(`unit not found: ${unitId}`);
  return u;
}

function normalizeUnit(u: Unit) {
  u.mods ??= [];
  u.tags ??= [];

  if (u.acBase === undefined && typeof u.ac === 'number') u.acBase = u.ac;
  if (u.integrityBase === undefined && typeof u.integrity === 'number')
    u.integrityBase = u.integrity;

  delete (u as any).ac;
  delete (u as any).integrity;
}

function clampStacks(v: number, maxStacks?: number): number {
  const max = Math.max(1, Math.floor(maxStacks ?? MAX_STACKS_GLOBAL));
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(max, Math.floor(v)));
}

function isActive(u: Unit, key: string): boolean {
  return (u.mods ?? []).some((m) => m.key === key);
}

function getStacks(u: Unit, key: string): number {
  const m = (u.mods ?? []).find((x) => x.key === key);
  // 없으면 0 (스택형 계산 편하게)
  return m ? Math.max(0, Math.floor(m.stacks ?? 1)) : 0;
}

function upsertMod(u: Unit, mod: UnitMod) {
  u.mods ??= [];
  const idx = u.mods.findIndex((m) => m.key === mod.key);
  if (idx >= 0) u.mods[idx] = mod;
  else u.mods.push(mod);
}

function removeMod(u: Unit, key: string) {
  if (!u.mods?.length) return;
  const idx = u.mods.findIndex((m) => m.key === key);
  if (idx >= 0) u.mods.splice(idx, 1);
}

// ---------- PATCH helpers ----------

function applyNumPatch(cur: number | undefined, patch: NumPatch): number {
  const base = typeof cur === 'number' ? cur : 0;
  if (typeof patch === 'number') return Math.floor(patch);
  return Math.floor(base + (patch.delta ?? 0));
}

function uniqTags(tags: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of tags) {
    const s = (t ?? '').trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function applyUnitPatch(u: Unit, patch: UnitPatch) {
  if (patch.name !== undefined) u.name = patch.name;

  if (patch.note !== undefined) {
    if (patch.note === null) delete u.note;
    else u.note = patch.note;
  }

  if (patch.colorCode !== undefined) {
    if (patch.colorCode === null) delete u.colorCode;
    else u.colorCode = Math.floor(patch.colorCode);
  }

  if (patch.ac !== undefined) {
    if (patch.ac === null) {
      delete u.acBase;
    } else {
      u.acBase = applyNumPatch(getBaseAc(u), patch.ac);
    }
  }

  if (patch.integrity !== undefined) {
    if (patch.integrity === null) {
      delete u.integrityBase;
    } else {
      const v = applyNumPatch(getBaseIntegrity(u), patch.integrity);
      if (v <= 0) delete u.integrityBase;
      else u.integrityBase = v;
    }
  }

  if (patch.hp !== undefined) {
    if (patch.hp === null) {
      delete u.hp;
    } else {
      u.hp ??= { cur: 0, max: 0 };

      const hpPatch = patch.hp;

      if (hpPatch.max !== undefined)
        u.hp.max = Math.max(0, Math.floor(hpPatch.max));

      if (hpPatch.cur !== undefined)
        u.hp.cur = applyNumPatch(u.hp.cur, hpPatch.cur);

      if (hpPatch.temp !== undefined) {
        if (hpPatch.temp === null) delete u.hp.temp;
        else {
          const tempVal = applyNumPatch(u.hp.temp, hpPatch.temp);
          if (tempVal <= 0) delete u.hp.temp;
          else u.hp.temp = tempVal;
        }
      }

      u.hp.cur = Math.max(0, u.hp.cur);
      u.hp.cur = Math.min(u.hp.cur, u.hp.max);
    }
  }

  if (patch.tags) {
    let tags = Array.isArray(u.tags) ? [...u.tags] : [];

    if (patch.tags.set) tags = uniqTags(patch.tags.set);

    if (patch.tags.add?.length) tags = uniqTags([...tags, ...patch.tags.add]);

    if (patch.tags.remove?.length) {
      const rm = new Set(
        patch.tags.remove.map((x) => (x ?? '').trim()).filter(Boolean),
      );
      tags = tags.filter((t) => !rm.has(t));
    }

    if (patch.tags.toggle?.length) {
      const tg = patch.tags.toggle.map((x) => (x ?? '').trim()).filter(Boolean);
      const set = new Set(tags);
      for (const t of tg) {
        if (set.has(t)) set.delete(t);
        else set.add(t);
      }
      tags = uniqTags([...set]);
    }

    u.tags = tags;
  }

  // PATCH로 preset 스택/토글 조작
  if (patch.presetStacks) {
    for (const [presetId, op] of Object.entries(patch.presetStacks)) {
      const preset = getPreset(presetId);

      const cur = clampStacks(getStacks(u, preset.id), preset.maxStacks); // 없으면 0
      let desiredRaw: number;

      if (op === null) {
        desiredRaw = 0; // 해제
      } else if (typeof op === 'number') {
        desiredRaw = op; // 설정
      } else {
        desiredRaw = cur + Math.floor(op.delta ?? 0); // 증감
      }

      const desired = clampStacks(desiredRaw, preset.maxStacks);

      if (desired <= 0) {
        removeMod(u, preset.id);
        continue;
      }

      // enabled 상태로 만들기
      if (preset.kind === 'toggle') {
        const stacks = 1; // 토글형은 항상 1
        const modBody = preset.buildMod({ target: u, stacks, args: undefined });
        upsertMod(u, { key: preset.id, stacks, ...modBody });
      } else {
        const stacks = desired;
        const modBody = preset.buildMod({ target: u, stacks, args: undefined });
        upsertMod(u, { key: preset.id, stacks, ...modBody });
      }
    }
  }
}
