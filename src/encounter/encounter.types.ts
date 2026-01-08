export type Side = 'TEAM' | 'ENEMY';

export interface Hp {
  cur: number;
  max: number;
  temp?: number; // 임시HP
}

/**
 * mods: 프리셋/버프 효과는 여기로만 (되돌리기 쉬움)
 * - key: presetId
 * - stacks: 스택형일 때만 의미(0이면 보통 제거)
 * - acDelta: "총합 변화량" (스택 변화 시 preset이 재계산해서 넣어줌)
 * - integritySet: "총합/설정값" (여러 모드 중 max)
 * - tagsAdd: 이 모드가 제공하는 태그들(표시용). 스택 표시는 렌더에서 xN으로 붙임.
 */
export interface UnitMod {
  key: string;
  stacks?: number;
  acDelta?: number;
  integritySet?: number;
  tagsAdd?: string[];
}

export type Pos = { x: number; z: number }; // x: 직선방향, z: 층

export type Marker = {
  id: string;
  kind: 'MARKER';
  name: string;
  pos: Pos;
};

export interface Unit {
  id: string;
  side: Side;
  name: string;

  hp?: Hp;

  acBase?: number;
  integrityBase?: number;

  // 수동 태그(오퍼레이터가 직접 붙이는 것)
  tags: string[];

  // 프리셋/버프(토글/스택)는 여기에만
  mods?: UnitMod[];

  note?: string;
  colorCode?: number;

  /** @deprecated (구버전 호환용) */ ac?: number;
  /** @deprecated (구버전 호환용) */ integrity?: number;

  pos?: Pos;
}

export type TurnEntry =
  | { kind: 'unit'; unitId: string }
  | { kind: 'label'; text: string };

export interface EncounterState {
  id: string;
  units: Unit[];
  markers?: Marker[];
  turnOrder: TurnEntry[];
  turnIndex: number;
  formationLines?: string[];
  updatedAt: string;

  // 추가: encounter별 기본 publish 채널
  publish?: {
    channelId?: string;
  };
}

// ---------- PATCH ----------

export type NumPatch = number | { delta: number };

export interface HpPatch {
  cur?: NumPatch;
  max?: number;
  temp?: NumPatch | null;
}

export interface TagsPatch {
  set?: string[];
  add?: string[];
  remove?: string[];
  toggle?: string[];
}

export type StackPatch = number | { delta: number } | null;

export interface UnitPatch {
  name?: string;
  ac?: NumPatch | null; // base AC 수정
  integrity?: NumPatch | null; // base integrity 수정
  hp?: HpPatch | null;
  tags?: TagsPatch; // 수동 태그만
  note?: string | null;
  colorCode?: number | null;
  /**
   * PATCH로 프리셋(토글/스택) 조작
   * - null: 해제(모드 제거)
   * - number: stacks를 그 값으로 "설정" (0이면 해제)
   * - {delta}: stacks를 상대 증감
   *
   * 토글형은 stacks>0이면 enabled로 취급(항상 stacks=1로 저장)
   */
  presetStacks?: Record<string, StackPatch>;
}

// ---------- ACTION ----------

export type Action =
  | { type: 'APPLY_DAMAGE'; unitId: string; amount: number }
  | { type: 'HEAL'; unitId: string; amount: number }
  | {
      type: 'SET_TEMP_HP';
      unitId: string;
      temp: number;
      mode?: 'normal' | 'force';
    }
  | { type: 'TOGGLE_TAG'; unitId: string; tag: string }
  | { type: 'NEXT_TURN' }
  | { type: 'PATCH_UNIT'; unitId: string; patch: UnitPatch }

  /**
   * 토글형/스택형 공통: enabled 미지정이면 toggle
   * - 토글형: enabled=true면 적용(=stacks=1), false면 해제(제거)
   * - 스택형: enabled=true면 stacks를 최소 1(defaultStacks)로, false면 제거
   */
  | {
      type: 'SET_PRESET';
      presetId: string;
      targetUnitId: string;
      enabled?: boolean;
      args?: Record<string, any>;
    }

  /**
   * 스택형 전용: delta만큼 스택 증감
   * - 결과 stacks가 0이면 제거(해제)
   * - 0..999로 클램프
   * - 토글형 프리셋에 쓰면 no-op(안전)
   */
  | {
      type: 'ADJUST_PRESET_STACK';
      presetId: string;
      targetUnitId: string;
      delta: number;
      args?: Record<string, any>;
    }
  | { type: 'SET_UNIT_POS'; unitId: string; x: number; z: number }
  | { type: 'MOVE_UNIT'; unitId: string; dx?: number; dz?: number }
  | {
      type: 'UPSERT_MARKER';
      markerId: string;
      name: string;
      x: number;
      z: number;
    }
  | { type: 'REMOVE_MARKER'; markerId: string };
