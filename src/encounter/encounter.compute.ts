import { getPreset } from './encounter.presets';
import { Unit } from './encounter.types';

function sum(nums: number[]) {
  let s = 0;
  for (const n of nums) s += n;
  return s;
}

function uniq(arr: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of arr) {
    const t = (x ?? '').trim();
    if (!t) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export function getBaseAc(u: Unit): number | undefined {
  const v = u.acBase ?? u.ac;
  return typeof v === 'number' ? v : undefined;
}

export function getAcBreakdown(u: Unit): {
  base?: number;
  delta: number;
  total?: number;
} {
  const base = getBaseAc(u);
  const mods = u.mods ?? [];
  const delta = sum(mods.map((m) => m.acDelta ?? 0));

  if (base === undefined) {
    return { base: undefined, delta, total: delta !== 0 ? delta : undefined };
  }
  return { base, delta, total: base + delta };
}

export function getBaseIntegrity(u: Unit): number | undefined {
  const v = u.integrityBase ?? u.integrity;
  return typeof v === 'number' ? v : undefined;
}

export function getComputedAc(u: Unit): number | undefined {
  return getAcBreakdown(u).total;
}

export function getComputedIntegrity(u: Unit): number | undefined {
  const base = getBaseIntegrity(u) ?? 0;
  const mods = u.mods ?? [];
  const modSets = mods.map((m) => m.integritySet ?? 0);
  const best = Math.max(base, ...modSets);
  return best > 0 ? best : undefined;
}

/**
 * ✅ 렌더용 태그: 수동 tags + mod.tagsAdd
 * - 스택형은 "(설한 x3)" 같이 보이게, tagsAdd가 포함하는 태그에 xN을 붙여줌
 * - 같은 태그가 여러 모드에서 나오면 중복 제거
 */
export function getDisplayTags(u: Unit): string[] {
  const manual = Array.isArray(u.tags) ? u.tags : [];
  const mods = u.mods ?? [];

  const fromMods: string[] = [];

  for (const m of mods) {
    const tags = (m.tagsAdd ?? []).map((t) => (t ?? '').trim()).filter(Boolean);
    if (tags.length === 0) continue;

    // preset kind 판별(정의가 없으면 토글 취급)
    let kind: 'toggle' | 'stack' = 'toggle';
    try {
      kind = getPreset(m.key).kind;
    } catch {}

    const stacks = Math.max(1, Math.floor(m.stacks ?? 1));

    if (kind === 'stack') {
      // ✅ 스택형: 첫 태그에만 xN (x1도 표시해서 토글/스택 구분 가능)
      fromMods.push(`${tags[0]} x${stacks}`);
      for (const t of tags.slice(1)) fromMods.push(t);
    } else {
      // ✅ 토글형: xN 없음
      for (const t of tags) fromMods.push(t);
    }
  }

  return uniq([...manual, ...fromMods]);
}

export function isPresetActive(u: Unit, presetId: string): boolean {
  return (u.mods ?? []).some((m) => m.key === presetId);
}
