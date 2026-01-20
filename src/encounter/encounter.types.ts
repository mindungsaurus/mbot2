// encounter.types.ts
export type Side = 'TEAM' | 'ENEMY' | 'NEUTRAL';
export type BenchGroup = 'TEAM' | 'ENEMY';
export type UnitType = 'NORMAL' | 'SERVANT' | 'BUILDING';
export type TurnGroup = {
  id: string;
  name: string;
  unitIds: string[];
};

export type HpFormula = {
  expr: string;
  params?: Record<string, number>;
  min?: number;
  max?: number;
};

export interface Hp {
  cur: number;
  max: number;
  temp?: number; // 임시HP
}

/**
 * mods: 프리셋/버프 효과는 여기로만 (되돌리기 쉬움)
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
  alias?: string;
  pos: Pos;
  // Optional multi-cell footprint
  cells?: Pos[];
  // Optional duration; decremented when this marker entry is passed in turn order.
  duration?: number;
  // Legacy fields (reserved for future use).
  createdRound?: number;
  ownerUnitId?: string;
};

/** 턴 기반 태그(스택/옵션) */
export interface TurnTagState {
  stacks: number; // >= 1
  decOnTurnStart?: boolean; // 옵션1: 자신의 턴이 "올 때" 감소
  decOnTurnEnd?: boolean; // 옵션2: 자신의 턴이 "끝날 때" 감소
}

export interface Unit {
  id: string;
  side: Side;
  bench?: BenchGroup;
  unitType?: UnitType;
  masterUnitId?: string;
  name: string;

  hp?: Hp;
  deathSaves?: { success: number; failure: number };

  acBase?: number;
  integrityBase?: number;

  // 수동 태그(오퍼레이터가 직접 붙이는 것)
  tags: string[];

  // 턴 기반 태그(스택/옵션)
  tagStates?: Record<string, TurnTagState>;

  /** formation 등에서 사용할 별칭(옵션) */
  alias?: string;

  /** 숨겨짐: formation 등에서 노출하지 않음 */
  hidden?: boolean;
  turnDisabled?: boolean;

  // 프리셋/버프(토글/스택)는 여기에만
  mods?: UnitMod[];

  // ?? ?? / ?? ???
  spellSlots?: Record<number, number>;
  consumables?: Record<string, number>;

  note?: string;
  colorCode?: number;

  /** @deprecated (구버전 호환용) */ ac?: number;
  /** @deprecated (구버전 호환용) */ integrity?: number;

  pos?: Pos;
}

export type TurnEntry =
  | { kind: 'unit'; unitId: string }
  | { kind: 'label'; text: string }
  | { kind: 'marker'; markerId: string }
  | { kind: 'group'; groupId: string };

export interface EncounterState {
  id: string;
  units: Unit[];
  markers?: Marker[];
  sideNotes?: Partial<Record<Side, string>>;
  turnOrder: TurnEntry[];
  turnGroups?: TurnGroup[];
  turnIndex: number;
  battleStarted?: boolean;

  /** @deprecated (구버전 호환용) */
  formationLines?: string[];

  updatedAt: string;

  /** 라운드 카운트 (1부터) */
  round: number;

  /** 임시 턴(중첩 가능). 마지막이 현재 임시 턴 유닛 */
  tempTurnStack?: string[];

  logs?: EncounterLogEntry[];

  // encounter별 기본 publish 채널
  publish?: {
    channelId?: string;
  };
}

export type LogKind =
  | 'ACTION'
  | 'TURN_END'
  | 'TURN_START'
  | 'TEMP_TURN_START'
  | 'TEMP_TURN_END'
  | 'TURN_RESUME';

export interface EncounterLogTurnCtx {
  round: number;
  isTemp: boolean;
  unitId: string | null;
  unitName: string | null;
}

export interface EncounterLogEntry {
  id: string;
  at: string; // ISO timestamp
  kind: LogKind;

  // 구조화된 컨텍스트 (UI에서 뱃지/필터링에 유용)
  ctx: EncounterLogTurnCtx;

  // 사람이 읽는 문자열 (예시처럼 prefix 포함)
  line: string;

  // UI가 상세 렌더링할 수 있게 원본 액션도 같이 저장(선택)
  action?: Action;
}

// ---------- PATCH ----------

export type NumPatch = number | { delta: number };

export interface HpPatch {
  cur?: NumPatch;
  max?: number;
  temp?: NumPatch | null;
}

// tagStates용 patch
export type TagStacksPatch = number | { delta: number } | null;

export interface TurnTagPatch {
  stacks?: TagStacksPatch; // null 또는 <=0이면 제거
  decOnTurnStart?: boolean;
  decOnTurnEnd?: boolean;
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
  side?: Side;
  alias?: string | null;
  unitType?: UnitType;
  masterUnitId?: string | null;
  ac?: NumPatch | null; // base AC 수정
  integrity?: NumPatch | null; // base integrity 수정
  hp?: HpPatch | null;

  tags?: TagsPatch; // 수동 태그만
  tagStates?: Record<string, TurnTagPatch | null>;

  spellSlots?: Record<number, number | null>;
  consumables?: Record<string, number | null>; // 턴 기반 태그 patch

  note?: string | null;
  colorCode?: number | null;
  hidden?: boolean | null;
  turnDisabled?: boolean | null;
  bench?: BenchGroup | null;

  presetStacks?: Record<string, StackPatch>;
}

// ---------- ACTION ----------

export type Action =
  | { type: 'BATTLE_START' }
  | { type: 'SET_SIDE_NOTES'; notes: Partial<Record<Side, string | null>> }
  | { type: 'APPLY_DAMAGE'; unitId: string; amount: number }
  | { type: 'HEAL'; unitId: string; amount: number }
  | {
      type: 'SET_TEMP_HP';
      unitId: string;
      temp: number;
      mode?: 'normal' | 'force';
    }
  | { type: 'SPEND_SPELL_SLOT'; unitId: string; level: number }
  | { type: 'RECOVER_SPELL_SLOT'; unitId: string; level: number }
  | {
      type: 'EDIT_DEATH_SAVES';
      unitId: string;
      success?: number;
      failure?: number;
      deltaSuccess?: number;
      deltaFailure?: number;
    }
  | { type: 'TOGGLE_TAG'; unitId: string; tag: string }
  | { type: 'TOGGLE_HIDDEN'; unitId: string; hidden?: boolean }
  | { type: 'NEXT_TURN' }
  | { type: 'SET_UNIT_LIST_ORDER'; unitIds: string[] }
  | { type: 'SET_UNIT_BENCH'; unitId: string; bench?: BenchGroup | null }
  | { type: 'PATCH_UNIT'; unitId: string; patch: UnitPatch }
  | {
      type: 'SET_PRESET';
      presetId: string;
      targetUnitId: string;
      enabled?: boolean;
      args?: Record<string, any>;
    }
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
      alias?: string;
      x: number;
      z: number;
      cells?: Pos[] | null;
      duration?: number | null;
    }
  | { type: 'REMOVE_MARKER'; markerId: string }
  | {
      type: 'CREATE_UNIT';
      unitId?: string;
      name: string;
      alias?: string;
      side: Side;
  bench?: BenchGroup;
      unitType?: UnitType;
      masterUnitId?: string;
      note?: string;
      hpFormula?: HpFormula;
      x: number;
      z: number;
      hpMax: number;
      acBase: number;
      colorCode?: number;
      turnOrderIndex: number; // turnOrder 삽입 위치(0-based)
    }
  | { type: 'REMOVE_UNIT'; unitId: string }
  | { type: 'GRANT_TEMP_TURN'; unitId: string }
  | { type: 'MOVE_TURN_ENTRY'; fromIndex: number; toIndex: number }
  | {
      type: 'SET_TURN_ORDER';
      turnOrder: TurnEntry[];
      turnGroups?: TurnGroup[];
    };
