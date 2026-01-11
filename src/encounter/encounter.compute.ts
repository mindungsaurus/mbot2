//encounter.compute.ts
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
 * ✅ 렌더용 태그:
 * - 수동 tags
 * - mod.tagsAdd (프리셋 토글/스택)
 * - turn tagStates (스택 + 옵션)  ← 신규
 *
 * 정책:
 * - 같은 태그명이 여러 소스에서 나오면 1개로 합침
 * - 스택형(=stacks가 있는 태그)은 항상 "태그 xN" 형태로 표시 (x1도 표시)
 * - 동일 태그가 여러 스택 소스에서 나오면 stacks는 "최댓값"으로 합침
 */
export function getDisplayTags(u: Unit): string[] {
  const order: string[] = [];
  const bag = new Map<string, { stacks?: number }>();

  const MAX_STACKS = 999;

  function clampStacks(v: any): number {
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(MAX_STACKS, n));
  }

  function addTag(raw: any, stacks?: number) {
    const key = (raw ?? '').trim();
    if (!key) return;

    if (!bag.has(key)) {
      bag.set(key, {});
      order.push(key);
    }

    if (stacks !== undefined) {
      const s = Math.max(1, clampStacks(stacks));
      const cur = bag.get(key)!;
      cur.stacks = cur.stacks === undefined ? s : Math.max(cur.stacks, s);
    }
  }

  // 1) manual tags
  const manual = Array.isArray(u.tags) ? u.tags : [];
  for (const t of manual) addTag(t);

  // 2) mods tagsAdd
  const mods = u.mods ?? [];
  for (const m of mods) {
    const tags = (m.tagsAdd ?? []).map((t) => (t ?? '').trim()).filter(Boolean);
    if (tags.length === 0) continue;

    let kind: 'toggle' | 'stack' = 'toggle';
    try {
      kind = getPreset(m.key).kind;
    } catch {
      // 정의 없으면 toggle 취급
    }

    if (kind === 'stack') {
      const stacks = Math.max(1, clampStacks(m.stacks ?? 1));
      // 스택형: 첫 태그에 xN
      addTag(tags[0], stacks);
      // 나머지는 일반 태그
      for (const t of tags.slice(1)) addTag(t);
    } else {
      // 토글형: 전부 일반 태그
      for (const t of tags) addTag(t);
    }
  }

  // 3) turn-based tagStates (신규)
  const ts = (u as any).tagStates as
    | Record<string, { stacks: number }>
    | undefined;

  if (ts && typeof ts === 'object') {
    for (const [tag, st] of Object.entries(ts)) {
      const stacks = Math.max(1, clampStacks(st?.stacks ?? 1));
      addTag(tag, stacks); // 턴태그는 스택형이므로 항상 xN 표시
    }
  }

  // 4) build output
  return order
    .map((k) => {
      const it = bag.get(k);
      if (it?.stacks !== undefined) return `${k} x${it.stacks}`;
      return k;
    })
    .filter(Boolean);
}

export function isPresetActive(u: Unit, presetId: string): boolean {
  return (u.mods ?? []).some((m) => m.key === presetId);
}
