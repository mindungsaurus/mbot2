import { Unit, UnitMod } from './encounter.types';

export type PresetKind = 'toggle' | 'stack';

export interface PresetCtx {
  target: Unit;
  stacks: number; // 스택형이면 0..999, 토글형이면 항상 1로 들어오게 처리
  args?: Record<string, any>;
}

/**
 * ✅ buildMod는 "현재 stacks 기준으로" 총합 효과를 계산해 반환
 * - acDelta는 "총합" 값으로 넣는 걸 권장(스택/임계값 로직을 여기서 해결)
 */
export interface PresetDef {
  id: string;
  title: string;
  kind: PresetKind;
  defaultStacks?: number; // stack형에서 enabled=true(없던 상태)로 켤 때 기본 스택
  maxStacks?: number; // 기본 999
  tagsBase?: string[]; // 표시 태그(원하면 여기로 빼도 됨. buildMod에서 처리해도 됨)
  buildMod: (ctx: PresetCtx) => Omit<UnitMod, 'key' | 'stacks'>;
}

export const PRESETS: Record<string, PresetDef> = {
  // ✅ 예시: 설한(스택형)
  // - 표시: (설한 xN)
  // - 효과 예시: 스택당 AC -1, 단 최대 -5
  // - 스택이 3 이상이면 추가 태그 "둔화"를 표시(예시)
  FROSTBITE: {
    id: 'FROSTBITE',
    title: '설한(스택)',
    kind: 'stack',
    defaultStacks: 1,
    maxStacks: 999,
    buildMod: ({ stacks }) => {
      const penalty = -Math.min(stacks, 5);
      const tagsAdd = ['설한', ...(stacks >= 3 ? ['둔화'] : [])];
      return { acDelta: penalty, tagsAdd };
    },
  },

  // ✅ 예시: 상처(스택형) — 일단 표시만, 효과는 필요시 추가
  WOUND: {
    id: 'WOUND',
    title: '상처(스택)',
    kind: 'stack',
    defaultStacks: 1,
    buildMod: ({ stacks }) => {
      // 효과를 넣고 싶으면 여기서 stacks 기반으로 acDelta/integritySet/tagsAdd 계산
      return { tagsAdd: ['상처'] };
    },
  },

  // ✅ 예시: 실명(토글형)
  BLINDED: {
    id: 'BLINDED',
    title: '실명(토글)',
    kind: 'toggle',
    buildMod: () => ({ tagsAdd: ['실명'] }),
  },

  // ✅ 예시: 무결성(토글형으로도 가능)
  INTEGRITY_5: {
    id: 'INTEGRITY_5',
    title: '무결성(5)',
    kind: 'toggle',
    buildMod: () => ({ integritySet: 5, tagsAdd: ['무결성'] }),
  },
};

export function getPreset(presetId: string): PresetDef {
  const p = PRESETS[presetId];
  if (!p) throw new Error(`unknown preset: ${presetId}`);
  return p;
}
