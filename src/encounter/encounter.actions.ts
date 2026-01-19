// encounter.actions.ts
import {
  Action,
  EncounterState,
  Unit,
  UnitType,
  TurnGroup,
  UnitPatch,
  NumPatch,
  UnitMod,
  TurnEntry,
  TagStacksPatch,
  Pos,
  Side,
  EncounterLogEntry,
  LogKind,
  HpFormula,
} from './encounter.types';
import {
  getComputedIntegrity,
  getBaseAc,
  getBaseIntegrity,
} from './encounter.compute';
import { getPreset } from './encounter.presets';
import { randomUUID } from 'crypto';
import { DiceService } from '../dice/dice.service';

const MAX_STACKS_GLOBAL = 999;
const MAX_TAG_STACKS = 999;
const MAX_ABS_POS = 10000;
const MAX_LOGS = 500;
const diceService = new DiceService();

type TurnTagDecayChange = {
  tag: string;
  from: number;
  to: number;
  when: 'start' | 'end';
};

function normPos(v: any): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return 0;
  return Math.max(-MAX_ABS_POS, Math.min(MAX_ABS_POS, n));
}

function evalHpFormula(formula?: HpFormula): number | null {
  if (!formula || typeof formula !== 'object') return null;
  const exprRaw = String(formula.expr ?? '').trim();
  if (!exprRaw) return null;

  const params: Record<string, number> = {};
  for (const [key, val] of Object.entries(formula.params ?? {})) {
    const name = String(key ?? '').trim();
    if (!name) continue;
    const num = Number(val);
    if (!Number.isFinite(num)) {
      throw new Error(`hpFormula param is not a number: ${name}`);
    }
    params[name] = num;
  }

  const resolved = exprRaw.replace(/\{([^}]+)\}/g, (_raw, keyRaw) => {
    const key = String(keyRaw ?? '').trim();
    if (!key) throw new Error('hpFormula has empty parameter name.');
    if (!(key in params)) {
      throw new Error(`hpFormula missing parameter: ${key}`);
    }
    return String(params[key]);
  });

  const result = diceService.rollExpression(resolved).total;
  if (!Number.isFinite(result)) {
    throw new Error('hpFormula result is not a number.');
  }

  let value = result;
  const min = Number(formula.min);
  const max = Number(formula.max);
  if (Number.isFinite(min)) value = Math.max(value, min);
  if (Number.isFinite(max)) value = Math.min(value, max);

  value = Math.round(value);
  return Math.max(0, value);
}

// Normalize marker footprint cells to clamped, unique positions.
function normalizeMarkerCells(cells: any): Pos[] | undefined {
  if (!Array.isArray(cells)) return undefined;

  const seen = new Set<string>();
  const out: Pos[] = [];

  for (const cell of cells) {
    if (!cell) continue;

    const x = normPos((cell as any).x);
    const z = normPos((cell as any).z);
    const key = `${x},${z}`;

    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ x, z });
  }

  return out.length ? out : undefined;
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
    case 'BATTLE_START': {
      if (state.battleStarted) return;

      const order = Array.isArray(state.turnOrder) ? state.turnOrder : [];
      state.battleStarted = true;
      state.tempTurnStack = [];
      delete state.tempTurnStack;

      const r = Math.floor((state as any).round ?? 1);
      (state as any).round = Number.isFinite(r) && r >= 1 ? r : 1;

      state.turnIndex = 0;
      const activeIdxs = getTurnEntryIndices(order, state);
      if (order.length > 0 && activeIdxs.length > 0) {
        state.turnIndex = coerceTurnIndexToEntry(order, state.turnIndex, state);
      }

      const firstEntry =
        activeIdxs.length > 0 ? order[state.turnIndex] : null;
      const firstName = firstEntry ? turnEntryLabel(state, firstEntry) : null;
      const msg = firstName ? `전투 개시. 첫 턴: ${firstName}.` : '전투 개시.';
      pushLog(state, 'ACTION', msg, action, makeLogCtx(state));
      return;
    }
    case 'APPLY_DAMAGE': {
      const ctx = makeLogCtx(state);
      const u = findUnit(state, action.unitId);
      normalizeUnit(u);
      if (!u.hp) return;

      const amount = Math.max(0, Math.floor(action.amount));
      if (amount === 0) return;

      // 룰 판단 제거: 무결성/감소 무시 같은 규칙은 프론트(오퍼레이터)가 결정
      let remaining = amount;

      // 1) 임시HP부터 소모
      const tempBefore = u.hp.temp ?? 0;
      if (tempBefore > 0) {
        const used = Math.min(tempBefore, remaining);
        const tempAfter = tempBefore - used;
        remaining -= used;

        if (tempAfter > 0) u.hp.temp = tempAfter;
        else delete u.hp.temp;
      }

      // 2) 남으면 현재 HP 감소
      const hpBefore = u.hp.cur;
      if (remaining > 0) {
        u.hp.cur = Math.max(0, u.hp.cur - remaining);
      }
      const hpAfter = u.hp.cur;

      // 로그를 좀 더 정보성 있게
      const tempAfter = u.hp.temp ?? 0;
      const usedTemp = Math.max(0, tempBefore - tempAfter);
      const usedHp = Math.max(0, hpBefore - hpAfter);

      pushLog(
        state,
        'ACTION',
        `${unitLabel(state, action.unitId)} 피해 ${amount} (임시HP -${usedTemp}, HP -${usedHp}).`,
        action,
        ctx,
      );
      return;
    }

    case 'HEAL': {
      const ctx = makeLogCtx(state);
      const u = findUnit(state, action.unitId);
      normalizeUnit(u);
      if (!u.hp) return;

      const amount = Math.max(0, Math.floor(action.amount));
      u.hp.cur = Math.min(u.hp.max, Math.max(0, u.hp.cur + amount));
      pushLog(
        state,
        'ACTION',
        `${unitLabel(state, action.unitId)}에게 ${amount}의 회복.`,
        action,
        ctx,
      );
      return;
    }

    case 'SET_TEMP_HP': {
      const ctx = makeLogCtx(state);
      const u = findUnit(state, action.unitId);
      normalizeUnit(u);
      if (!u.hp) return;

      const before = u.hp.temp ?? 0;

      const temp = Math.max(0, Math.floor(action.temp));
      const mode = action.mode ?? 'normal';
      const curTemp = u.hp.temp ?? 0;

      if (mode === 'normal') {
        // 룰: 더 큰 값만 갱신, 0으로 삭제는 force에서만
        if (temp === 0) return;
        if (temp <= curTemp) return;
      }

      if (temp <= 0) delete u.hp.temp;
      else u.hp.temp = temp;
      const after = u.hp.temp ?? 0;
      if (after !== before) {
        if (after > before) {
          pushLog(
            state,
            'ACTION',
            `${unitLabel(state, action.unitId)} 임시HP ${after} 획득 (이전 ${before}).`,
            action,
            ctx,
          );
        } else {
          pushLog(
            state,
            'ACTION',
            `${unitLabel(state, action.unitId)} 임시HP ${before} → ${after}.`,
            action,
            ctx,
          );
        }
      }
      return;
    }

    case 'SPEND_SPELL_SLOT': {
      const ctx = makeLogCtx(state);
      const u = findUnit(state, action.unitId);
      normalizeUnit(u);

      const level = Math.floor(Number(action.level));
      if (!Number.isFinite(level) || level < 1 || level > 9) return;

      const slots = u.spellSlots ?? {};
      const raw = (slots as any)[level] ?? (slots as any)[String(level)];
      if (raw === undefined) return;

      const before = Math.max(0, Math.floor(Number(raw)));
      if (before <= 0) return;

      const after = Math.max(0, before - 1);
      u.spellSlots ??= {};
      u.spellSlots[level] = after;

      pushLog(
        state,
        'ACTION',
        `${unitLabel(state, action.unitId)} 주문 슬롯 L${level}: ${before} → ${after}.`,
        action,
        ctx,
      );
      return;
    }

    case 'RECOVER_SPELL_SLOT': {
      const ctx = makeLogCtx(state);
      const u = findUnit(state, action.unitId);
      normalizeUnit(u);

      const level = Math.floor(Number(action.level));
      if (!Number.isFinite(level) || level < 1 || level > 9) return;

      const slots = u.spellSlots ?? {};
      const raw = (slots as any)[level] ?? (slots as any)[String(level)];
      if (raw === undefined) return;

      const before = Math.max(0, Math.floor(Number(raw)));
      const after = before + 1;
      u.spellSlots ??= {};
      u.spellSlots[level] = after;

      pushLog(
        state,
        'ACTION',
        `${unitLabel(state, action.unitId)} 주문 슬롯 L${level} 회복: ${before} → ${after}.`,
        action,
        ctx,
      );
      return;
    }

    case 'EDIT_DEATH_SAVES': {
      const ctx = makeLogCtx(state);
      const u = findUnit(state, action.unitId);
      normalizeUnit(u);

      const beforeSuccess = Math.max(
        0,
        Math.floor(Number(u.deathSaves?.success ?? 0)),
      );
      const beforeFailure = Math.max(
        0,
        Math.floor(Number(u.deathSaves?.failure ?? 0)),
      );

      let nextSuccess = beforeSuccess;
      let nextFailure = beforeFailure;

      if (typeof action.success === 'number') {
        nextSuccess = Math.max(0, Math.floor(action.success));
      } else if (typeof action.deltaSuccess === 'number') {
        nextSuccess = Math.max(
          0,
          Math.floor(beforeSuccess + action.deltaSuccess),
        );
      }

      if (typeof action.failure === 'number') {
        nextFailure = Math.max(0, Math.floor(action.failure));
      } else if (typeof action.deltaFailure === 'number') {
        nextFailure = Math.max(
          0,
          Math.floor(beforeFailure + action.deltaFailure),
        );
      }

      if (nextSuccess === beforeSuccess && nextFailure === beforeFailure) return;

      u.deathSaves = { success: nextSuccess, failure: nextFailure };

      const diffs: string[] = [];
      if (nextSuccess !== beforeSuccess) {
        diffs.push(`성공 ${beforeSuccess}→${nextSuccess}`);
      }
      if (nextFailure !== beforeFailure) {
        diffs.push(`실패 ${beforeFailure}→${nextFailure}`);
      }

      pushLog(
        state,
        'ACTION',
        `${unitLabel(state, action.unitId)} 사망 내성 변경: ${diffs.join(', ')}.`,
        action,
        ctx,
      );
      return;
    }

    case 'TOGGLE_TAG': {
      const ctx = makeLogCtx(state);

      const u = findUnit(state, action.unitId);
      normalizeUnit(u);
      const tag = (action.tag ?? '').trim();
      if (!tag) return;

      const had = u.tags.includes(tag);

      const idx = u.tags.findIndex((t) => t === tag);
      if (idx >= 0) u.tags.splice(idx, 1);
      else u.tags.push(tag);

      pushLog(
        state,
        'ACTION',
        `${unitLabel(state, action.unitId)} 태그 '${tag}' ${had ? '제거' : '추가'}.`,
        action,
        ctx,
      );
      return;
    }

    case 'TOGGLE_HIDDEN': {
      const ctx = makeLogCtx(state);

      const u = findUnit(state, action.unitId);
      normalizeUnit(u);

      const before = !!u.hidden;
      const after = action.hidden !== undefined ? !!action.hidden : !before;

      if (after) u.hidden = true;
      else delete u.hidden;

      if (before !== after) {
        pushLog(
          state,
          'ACTION',
          `${unitLabel(state, action.unitId)} 숨겨짐 ${after ? '적용' : '해제'}.`,
          action,
          ctx,
        );
      }
      return;
    }

    case 'GRANT_TEMP_TURN': {
      if (!state.battleStarted) return;
      const ctxBefore = makeLogCtx(state);
      const id = (action.unitId ?? '').trim();
      if (!id) return;

      // 유닛 존재 확인
      const target = findUnit(state, id);
      normalizeUnit(target);
      if (normalizeUnitType((target as any).unitType) !== 'NORMAL') return;

      const active = getActiveTurnEntry(state);
      if (active?.entry?.kind === 'unit' && active.entry.unitId === id) return; // 이미 현재 턴 주체면 no-op(중복 감소 방지)

      state.tempTurnStack ??= [];
      state.tempTurnStack.push(id);

      // 임시 턴 "시작" 자동감소 (+ 내역 수집)
      const startDecays = decTurnTags(target, 'start');

      // 로그(부여)
      pushLog(
        state,
        'ACTION',
        `${unitLabel(state, id)}에게 임시 턴 부여.`,
        action,
        ctxBefore,
      );

      // 임시턴 ctx (push 이후라 isTemp가 true일 것)
      const ctxTemp = makeLogCtx(state);

      // 로그(임시 턴 시작)
      pushLog(
        state,
        'TEMP_TURN_START',
        `${ctxTemp.unitName ?? id}, 턴 시작.`,
        action,
        ctxTemp,
      );

      // 로그(임시 턴 시작 시 태그 자동감소)
      if (startDecays.length) {
        const txt = startDecays
          .map((c) => `${c.tag} ${c.from}→${c.to}`)
          .join(', ');
        pushLog(
          state,
          'ACTION',
          `${ctxTemp.unitName ?? id} 태그 자동감소(턴 시작): ${txt}.`,
          action,
          ctxTemp,
        );
      }

      applyServantTagDecays(state, id, 'start', action, ctxTemp);

      return;
    }

    case 'NEXT_TURN': {
      if (!state.battleStarted) return;
      const ctxBefore = makeLogCtx(state);
      const order = Array.isArray(state.turnOrder) ? state.turnOrder : [];
      if (order.length === 0) return;

      // ? 현재 턴 주체(임시 턴이 있으면 그쪽이 우선)
      const active = getActiveTurnEntry(state);
      const activeEntry = active.entry;
      if (!activeEntry) return;


      // 1) 현재 턴 "종료" 자동감소 (+ 내역 수집)
      let endDecays: TurnTagDecayChange[] = [];
      if (activeEntry.kind === 'unit') {
        const u = state.units.find((x) => x.id === activeEntry.unitId);
        if (u) {
          normalizeUnit(u);
          endDecays = decTurnTags(u, 'end');
        }
      }

      // 로그: 턴 종료
      pushLog(
        state,
        ctxBefore.isTemp ? 'TEMP_TURN_END' : 'TURN_END',
        `${ctxBefore.unitName ?? ctxBefore.unitId ?? '-'}, 턴 종료.`,
        action,
        ctxBefore,
      );

      // 로그: 턴 종료 시 태그 자동감소(있을 때만)
      if (endDecays.length) {
        const txt = endDecays
          .map((c) => `${c.tag} ${c.from}→${c.to}`)
          .join(', ');
        pushLog(
          state,
          'ACTION',
          `${ctxBefore.unitName ?? ctxBefore.unitId ?? '-'} 태그 자동감소(턴 종료): ${txt}.`,
          action,
          ctxBefore,
        );
      }

      if (activeEntry.kind === 'unit') {
        applyServantTagDecays(
          state,
          activeEntry.unitId,
          'end',
          action,
          ctxBefore,
        );
      } else if (activeEntry.kind === 'group') {
        applyGroupTurnDecays(state, activeEntry.groupId, 'end', action, ctxBefore);
      }

      // 2) 임시 턴이면: pop 후 "재개" (턴오더 진행 X, start 감소 X)
      if (state.tempTurnStack?.length) {
        state.tempTurnStack.pop();
        if (state.tempTurnStack.length === 0) delete state.tempTurnStack;

        const ctxResume = makeLogCtx(state);
        // 재개 로그(원치 않으면 삭제 가능)
        pushLog(
          state,
          'TURN_RESUME',
          `턴 재개: ${ctxResume.unitName ?? ctxResume.unitId ?? '-'}.`,
          action,
          ctxResume,
        );
        return;
      }

      // 3) 정상 턴 진행: label 제외, 유닛/그룹만
      const entryIdxs = getTurnEntryIndices(order, state);
      if (entryIdxs.length === 0) return;

      // turnIndex가 턴 엔트리가 아니면 첫 턴 엔트리로 보정
      state.turnIndex = coerceTurnIndexToEntry(order, state.turnIndex, state);

      const ti = state.turnIndex;
      const pos = entryIdxs.indexOf(ti);
      const nextPos = (pos + 1) % entryIdxs.length;
      const nextTi = entryIdxs[nextPos];

      const markerIds = getMarkerIdsBetween(order, ti, nextTi);
      const disabledUnitIds = getDisabledUnitIdsBetween(
        order,
        ti,
        nextTi,
        state,
      );

      if (disabledUnitIds.length) {
        // Turn-disabled units still apply start/end tag decays when passed.
        for (const unitId of disabledUnitIds) {
          const u = state.units.find((x) => x.id === unitId);
          if (!u) continue;
          normalizeUnit(u);

          const startDecays = decTurnTags(u, 'start');
          const endDecays = decTurnTags(u, 'end');

          if (!startDecays.length && !endDecays.length) continue;

          const ctxDisabled = makeUnitCtx(state, unitId);

          if (startDecays.length) {
            const txt = startDecays
              .map((c) => `${c.tag} ${c.from}->${c.to}`)
              .join(', ');
            pushLog(
              state,
              'ACTION',
              `${ctxDisabled.unitName ?? unitId} 태그 자동감소(시작): ${txt}.`,
              action,
              ctxDisabled,
            );
          }

          applyServantTagDecays(state, unitId, 'start', action, ctxDisabled);

          if (endDecays.length) {
            const txt = endDecays
              .map((c) => `${c.tag} ${c.from}->${c.to}`)
              .join(', ');
            pushLog(
              state,
              'ACTION',
              `${ctxDisabled.unitName ?? unitId} 태그 자동감소(종료): ${txt}.`,
              action,
              ctxDisabled,
            );
          }

          applyServantTagDecays(state, unitId, 'end', action, ctxDisabled);
        }
      }

      // 4) 라운드 증가: 마지막 엔트리 -> 첫 엔트리로 넘어갈 때
      if (nextPos === 0) {
        const r = Math.floor((state as any).round ?? 1);
        (state as any).round = Number.isFinite(r) && r >= 1 ? r + 1 : 2;
      }

      state.turnIndex = nextTi;

      if (markerIds.length) {
        tickMarkersOnPass(state, markerIds, action, ctxBefore);
      }

      // 5) 다음 유닛 "턴 시작" 자동감소 (+ 내역 수집)
      let startDecays: TurnTagDecayChange[] = [];
      const nextEntry = order[nextTi];
      if (nextEntry?.kind === 'unit') {
        const nextUnit = state.units.find((x) => x.id === nextEntry.unitId);
        if (nextUnit) {
          normalizeUnit(nextUnit);
          startDecays = decTurnTags(nextUnit, 'start');
        }
      }

      const ctxAfter = makeLogCtx(state);

      // 로그: 턴 시작
      pushLog(
        state,
        'TURN_START',
        `${ctxAfter.unitName ?? ctxAfter.unitId ?? '-'}, 턴 시작.`,
        action,
        ctxAfter,
      );

      // 로그: 턴 시작 시 태그 자동감소(있을 때만)
      if (startDecays.length) {
        const txt = startDecays
          .map((c) => `${c.tag} ${c.from}→${c.to}`)
          .join(', ');
        pushLog(
          state,
          'ACTION',
          `${ctxAfter.unitName ?? ctxAfter.unitId ?? '-'} 태그 자동감소(턴 시작): ${txt}.`,
          action,
          ctxAfter,
        );
      }

      if (nextEntry?.kind === 'unit') {
        applyServantTagDecays(state, nextEntry.unitId, 'start', action, ctxAfter);
      } else if (nextEntry?.kind === 'group') {
        applyGroupTurnDecays(state, nextEntry.groupId, 'start', action, ctxAfter);
      }

      return;
    }

    case 'PATCH_UNIT': {
      const ctx = makeLogCtx(state);

      const u = findUnit(state, action.unitId);
      normalizeUnit(u);

      const beforeType = normalizeUnitType((u as any).unitType);
      const beforeMaster = (u as any).masterUnitId
        ? String((u as any).masterUnitId)
        : null;
      const patchType = (action.patch as any).unitType;
      const patchMaster = (action.patch as any).masterUnitId;

      let nextType = beforeType;
      let nextMaster = beforeMaster;

      if (patchType !== undefined) {
        nextType = normalizeUnitType(patchType);
      }

      if (patchMaster !== undefined) {
        if (patchMaster === null) {
          nextMaster = null;
        } else {
          const trimmed = String(patchMaster ?? '').trim();
          nextMaster = trimmed ? trimmed : null;
        }
      }

      if (nextType !== 'SERVANT') {
        nextMaster = null;
      } else {
        const masterId = nextMaster;
        const master = masterId
          ? state.units.find((x) => x.id === masterId)
          : null;
        if (!master || masterId === u.id) {
          nextType = beforeType;
          nextMaster = beforeMaster;
        } else if (normalizeUnitType((master as any).unitType) !== 'NORMAL') {
          nextType = beforeType;
          nextMaster = beforeMaster;
        }
      }

      const beforeTags = Array.isArray(u.tags) ? [...u.tags] : [];
      const beforeTagStates = u.tagStates
        ? structuredClone(u.tagStates)
        : undefined;
      const beforeSlots = u.spellSlots ? { ...u.spellSlots } : undefined;
      const beforeHidden = !!u.hidden;
      const beforeTurnDisabled = !!u.turnDisabled;
      const beforeSide = u.side;

      applyUnitPatch(u, action.patch);

      if (beforeType !== nextType || beforeMaster !== nextMaster) {
        if (nextType === 'NORMAL') {
          delete (u as any).unitType;
          delete (u as any).masterUnitId;
        } else if (nextType === 'BUILDING') {
          (u as any).unitType = 'BUILDING';
          delete (u as any).masterUnitId;
        } else {
          (u as any).unitType = 'SERVANT';
          if (nextMaster) (u as any).masterUnitId = nextMaster;
          else delete (u as any).masterUnitId;
        }
      }

      const afterType = normalizeUnitType((u as any).unitType);
      if (beforeType === 'NORMAL' && afterType !== 'NORMAL') {
        removeUnitFromTurnOrder(state, u.id);
      } else if (beforeType !== 'NORMAL' && afterType === 'NORMAL') {
        if (!u.bench) {
          state.turnOrder ??= [];
          const exists = state.turnOrder.some(
            (t) => t?.kind === 'unit' && t.unitId === u.id,
          );
          if (!exists) {
            state.turnOrder.push({ kind: 'unit', unitId: u.id });
          }
          if (typeof state.turnIndex !== 'number') state.turnIndex = 0;
          state.turnIndex = clampTurnIndex(state.turnOrder, state.turnIndex);
          state.turnIndex = coerceTurnIndexToEntry(
            state.turnOrder,
            state.turnIndex,
            state,
          );
        }
      }

      const afterTags = Array.isArray(u.tags) ? [...u.tags] : [];
      const afterTagStates = u.tagStates
        ? structuredClone(u.tagStates)
        : undefined;
      const afterSlots = u.spellSlots ? { ...u.spellSlots } : undefined;
      const afterHidden = !!u.hidden;
      const afterTurnDisabled = !!u.turnDisabled;
      const afterSide = u.side;
      const afterBench = !!u.bench;

      if (afterBench || afterTurnDisabled || afterType !== 'NORMAL') {
        removeUnitFromTurnGroups(state, u.id);
      }

      // 수동 tags 변화
      const { added, removed } = diffManualTags(beforeTags, afterTags);
      if (added.length || removed.length) {
        const parts: string[] = [];
        if (added.length) parts.push(`추가: ${added.join(', ')}`);
        if (removed.length) parts.push(`제거: ${removed.join(', ')}`);
        pushLog(
          state,
          'ACTION',
          `${unitLabel(state, action.unitId)} 태그 변경 (${parts.join(' / ')}).`,
          action,
          ctx,
        );
      }

      // tagStates 변화
      const tsDiff = diffTagStates(beforeTagStates, afterTagStates);
      if (tsDiff.length) {
        pushLog(
          state,
          'ACTION',
          `${unitLabel(state, action.unitId)} 턴태그 변경: ${tsDiff.join(' ; ')}.`,
          action,
          ctx,
        );
      }

      // spellSlots 변화
      {
        const levels = new Set<number>();
        for (const key of Object.keys(beforeSlots ?? {})) {
          const lvl = Math.floor(Number(key));
          if (Number.isFinite(lvl) && lvl >= 1 && lvl <= 9) levels.add(lvl);
        }
        for (const key of Object.keys(afterSlots ?? {})) {
          const lvl = Math.floor(Number(key));
          if (Number.isFinite(lvl) && lvl >= 1 && lvl <= 9) levels.add(lvl);
        }

        const diffs: string[] = [];
        const normalizeSlot = (raw: any) =>
          Math.max(0, Math.floor(Number(raw ?? 0)));

        for (const lvl of Array.from(levels).sort((a, b) => a - b)) {
          const key = String(lvl);
          const beforeHas =
            !!beforeSlots &&
            Object.prototype.hasOwnProperty.call(beforeSlots, key);
          const afterHas =
            !!afterSlots &&
            Object.prototype.hasOwnProperty.call(afterSlots, key);

          if (!beforeHas && !afterHas) continue;
          const beforeVal = beforeHas ? normalizeSlot((beforeSlots as any)[key]) : undefined;
          const afterVal = afterHas ? normalizeSlot((afterSlots as any)[key]) : undefined;
          if (beforeHas && afterHas && beforeVal === afterVal) continue;

          diffs.push(
            `L${lvl} ${beforeVal === undefined ? '-' : beforeVal}→${afterVal === undefined ? '-' : afterVal}`,
          );
        }

        if (diffs.length) {
          pushLog(
            state,
            'ACTION',
            `${unitLabel(state, action.unitId)} 주문 슬롯 변경: ${diffs.join(', ')}.`,
            action,
            ctx,
          );
        }
      }

      // hidden 변화
      if (beforeHidden !== afterHidden) {
        pushLog(
          state,
          'ACTION',
          `${unitLabel(state, action.unitId)} 숨겨짐 ${afterHidden ? '적용' : '해제'}.`,
          action,
          ctx,
        );
      }
      if (beforeTurnDisabled !== afterTurnDisabled) {
        pushLog(
          state,
          'ACTION',
          `${unitLabel(state, action.unitId)} 턴 비활성화${
            afterTurnDisabled ? ' 적용' : ' 해제'
          }.`,
          action,
          ctx,
        );
      }

      if (beforeSide !== afterSide) {
        pushLog(
          state,
          'ACTION',
          `${unitLabel(state, action.unitId)} 진영 변경: ${beforeSide} -> ${afterSide}.`,
          action,
          ctx,
        );
      }

      if (!beforeTurnDisabled && afterTurnDisabled) {
        state.turnIndex = coerceTurnIndexToEntry(
          state.turnOrder,
          state.turnIndex,
          state,
        );
      }

      return;
    }

    case 'SET_PRESET': {
      const u = findUnit(state, action.targetUnitId);
      normalizeUnit(u);

      const preset = getPreset(action.presetId);
      const active = isActive(u, preset.id);
      const enabled = action.enabled ?? !active;

      if (!enabled) {
        removeMod(u, preset.id);
        return;
      }

      if (preset.kind === 'toggle') {
        const stacks = 1;
        const modBody = preset.buildMod({
          target: u,
          stacks,
          args: action.args,
        });
        upsertMod(u, { key: preset.id, stacks, ...modBody });
        return;
      }

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
      if (preset.kind !== 'stack') return;

      const delta = Math.floor(action.delta ?? 0);
      if (delta === 0) return;

      const curStacks = clampStacks(getStacks(u, preset.id), preset.maxStacks);
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
      const ctx = makeLogCtx(state);

      const u = findUnit(state, action.unitId);
      normalizeUnit(u);

      const before = u.pos ? { ...u.pos } : { x: 0, z: 0 };

      const x = normPos(action.x);
      const z = normPos(action.z);
      u.pos = { x, z };

      const after = u.pos;
      if (before.x !== after.x || before.z !== after.z) {
        pushLog(
          state,
          'ACTION',
          `${unitLabel(state, action.unitId)} 위치 설정 ${fmtPos(before)} → ${fmtPos(after)}.`,
          action,
          ctx,
        );
      }
      return;
    }

    case 'MOVE_UNIT': {
      const ctx = makeLogCtx(state);

      const u = findUnit(state, action.unitId);
      normalizeUnit(u);

      const dx = normPos(action.dx ?? 0);
      const dz = normPos(action.dz ?? 0);

      const before = u.pos ? { ...u.pos } : { x: 0, z: 0 };
      const cur = u.pos ?? { x: 0, z: 0 };
      u.pos = { x: normPos(cur.x + dx), z: normPos(cur.z + dz) };

      const after = u.pos;
      if (before.x !== after.x || before.z !== after.z) {
        const moved = formatMoveDelta(after.x - before.x, after.z - before.z);
        pushLog(
          state,
          'ACTION',
          `${unitLabel(state, action.unitId)} ${moved} ${fmtPos(before)} → ${fmtPos(after)}.`,
          action,
          ctx,
        );
      }
      return;
    }

    case 'UPSERT_MARKER': {
      const ctx = makeLogCtx(state);

      const id = (action.markerId ?? '').trim();
      const name = (action.name ?? '').trim();
      const aliasRaw =
        typeof action.alias === 'string' ? action.alias.trim() : '';
      if (!id || !name) return;

      const x = normPos(action.x);
      const z = normPos(action.z);

      state.markers ??= [];
      const idx = state.markers.findIndex((m) => m.id === id);
      const existed = idx >= 0;
      const before = existed ? { ...state.markers[idx].pos } : undefined;

      const base = existed ? state.markers[idx] : undefined;
      const m: any = {
        ...(base ?? {}),
        id,
        kind: 'MARKER' as const,
        name,
        pos: { x, z },
      };

      if (action.alias !== undefined) {
        if (aliasRaw) m.alias = aliasRaw;
        else delete m.alias;
      }

      if (action.cells !== undefined) {
        if (action.cells === null) {
          delete m.cells;
        } else {
          const normalized = normalizeMarkerCells(action.cells);
          if (normalized?.length) m.cells = normalized;
          else delete m.cells;
        }
      }

      if (action.duration !== undefined) {
        if (action.duration === null) {
          delete m.duration;
          delete m.createdRound;
          delete m.ownerUnitId;
        } else {
          const duration = Math.floor(Number(action.duration));
          if (!Number.isFinite(duration) || duration <= 0) {
            delete m.duration;
            delete m.createdRound;
            delete m.ownerUnitId;
          } else {
            m.duration = duration;
            delete m.createdRound;
            delete m.ownerUnitId;
          }
        }
      }
      const order = Array.isArray(state.turnOrder)
        ? state.turnOrder
        : (state.turnOrder = []);
      const hasEntry = order.some(
        (t: any) => t?.kind === 'marker' && t.markerId === id,
      );
      const wantsEntry = Number.isFinite(m.duration) && m.duration > 0;

      if (wantsEntry && !hasEntry) {
        const insertAt = coerceTurnIndexToEntry(order, state.turnIndex, state);
        order.splice(insertAt, 0, { kind: 'marker', markerId: id });
        if (insertAt <= state.turnIndex) state.turnIndex += 1;
      } else if (!wantsEntry && hasEntry) {
        removeMarkerEntriesFromOrder(state, new Set([id]));
      }

      if (idx >= 0) state.markers[idx] = m;
      else state.markers.push(m);

      if (!existed) {
        pushLog(
          state,
          'ACTION',
          `마커 생성: ${name}(${id}) @ ${fmtPos(m.pos)}.`,
          action,
          ctx,
        );
      } else {
        const moved = before && (before.x !== x || before.z !== z);
        pushLog(
          state,
          'ACTION',
          moved
            ? `마커 이동: ${name}(${id}) ${fmtPos(before)} → ${fmtPos(m.pos)}.`
            : `마커 갱신: ${name}(${id}) @ ${fmtPos(m.pos)}.`,
          action,
          ctx,
        );
      }
      return;
    }

    case 'REMOVE_MARKER': {
      const ctx = makeLogCtx(state);

      const id = (action.markerId ?? '').trim();
      if (!id || !state.markers?.length) return;

      const idx = state.markers.findIndex((m) => m.id === id);
      if (idx < 0) return;

      const removed = state.markers[idx];
      state.markers.splice(idx, 1);

      removeMarkerEntriesFromOrder(state, new Set([id]));

      pushLog(
        state,
        'ACTION',
        `마커 삭제: ${removed.name}(${removed.id}) @ ${fmtPos(removed.pos)}.`,
        action,
        ctx,
      );
      return;
    }

    case 'CREATE_UNIT': {
      const ctx = makeLogCtx(state);
      const name = (action.name ?? '').trim();
      if (!name) return;

      if (!isSide(action.side)) return;

      const unitType = normalizeUnitType((action as any).unitType);
      const masterUnitId =
        unitType === 'SERVANT'
          ? String((action as any).masterUnitId ?? '').trim()
          : '';

      if (unitType === 'SERVANT') {
        if (!masterUnitId) return;
        const master = state.units?.find((u) => u.id === masterUnitId);
        if (!master) return;
        if (normalizeUnitType((master as any).unitType) !== 'NORMAL') return;
      }

      const x = normPos(action.x);
      const z = normPos(action.z);

      let hpMax = Math.max(0, Math.floor(Number(action.hpMax ?? 0)));
      const hpFormulaValue = evalHpFormula((action as any).hpFormula);
      if (typeof hpFormulaValue === 'number') {
        hpMax = hpFormulaValue;
      }
      const acBase = Math.floor(Number(action.acBase ?? 0));

      const aliasRaw = (action.alias ?? '').trim();
      const alias = aliasRaw ? aliasRaw : undefined;
      const noteRaw = String((action as any).note ?? '').trim();
      const note = noteRaw ? noteRaw : undefined;

      const colorCode = normalizeAnsiColorCode(action.colorCode);
      const requestedId = String((action as any).unitId ?? '').trim();
      if (requestedId) {
        const exists = (state.units ?? []).some((u) => u.id === requestedId);
        if (exists) throw new Error(`unit id already exists: ${requestedId}`);
      }
      const id = requestedId || randomUUID();

      const u: Unit = {
        id,
        side: action.side,
        unitType,
        ...(unitType === 'SERVANT' ? { masterUnitId } : {}),
        name,
        ...(alias ? { alias } : {}),
        ...(note ? { note } : {}),
        tags: [],
        mods: [],
        pos: { x, z },
        ...(hpMax > 0 ? { hp: { cur: hpMax, max: hpMax } } : {}),
        ...(Number.isFinite(acBase) ? { acBase } : {}),
        ...(typeof colorCode === 'number' ? { colorCode } : {}),
      };

      state.units ??= [];
      state.units.push(u);

      state.turnOrder ??= [];
      if (unitType === 'NORMAL') {
        const insertAt = clampIndex(
          action.turnOrderIndex,
          state.turnOrder.length,
        );
        state.turnOrder.splice(insertAt, 0, { kind: 'unit', unitId: u.id });

        // 삽입이 현재 turnIndex 이전/같으면 +1 (가리키던 항목이 밀림)
        if (typeof state.turnIndex !== 'number') state.turnIndex = 0;
        if (insertAt <= state.turnIndex) state.turnIndex += 1;

        state.turnIndex = clampTurnIndex(state.turnOrder, state.turnIndex);
        state.turnIndex = coerceTurnIndexToEntry(
          state.turnOrder,
          state.turnIndex,
          state,
        );
      }

      // round 기본값 보정(없거나 이상하면 1)
      ensureRound(state);

      pushLog(state, 'ACTION', `유닛 생성: ${name}.`, action, ctx);
      return;
    }

    case 'REMOVE_UNIT': {
      const ctx = makeLogCtx(state);
      const id = (action as any).unitId?.trim?.() ?? '';
      if (!id) return;

      const removedName = unitLabel(state, id);

      const unitExists = state.units.some((u) => u.id === id);
      if (!unitExists) throw new Error(`unit not found: ${id}`);

      const servantIds = getServants(state, id).map((u) => u.id);
      const removeIds = new Set<string>([id, ...servantIds]);

      for (const removeId of removeIds) {
        removeUnitFromTurnGroups(state, removeId);
      }

      const order = Array.isArray(state.turnOrder) ? state.turnOrder : [];
      const activeKey = getTurnEntryKey(getActiveTurnEntry(state).entry);

      if (state.tempTurnStack?.length) {
        state.tempTurnStack = state.tempTurnStack.filter((x) => !removeIds.has(x));
        if (state.tempTurnStack.length === 0) delete state.tempTurnStack;
      }

      state.units = (state.units ?? []).filter((u) => !removeIds.has(u.id));

      const filtered = order.filter((t: any) => {
        if (t?.kind === 'label') return true;
        if (t?.kind === 'marker') return true;
        if (t?.kind === 'unit') return !removeIds.has(t.unitId);
        return false;
      });

      state.turnOrder = filtered;

      const suffix = servantIds.length
        ? ` (+서번트 ${servantIds.length})`
        : '';

      if (filtered.length === 0) {
        state.turnIndex = 0;
        pushLog(
          state,
          'ACTION',
          `유닛 삭제: ${removedName}${suffix}.`,
          action,
          ctx,
        );
        return;
      }

      if (activeKey) {
        const idx = findTurnEntryIndex(filtered, activeKey);
        if (idx != null) {
          state.turnIndex = idx;
          pushLog(
            state,
            'ACTION',
            `유닛 삭제: ${removedName}${suffix}.`,
            action,
            ctx,
          );
          return;
        }
      }

      state.turnIndex = clampTurnIndex(filtered, state.turnIndex);
      state.turnIndex = coerceTurnIndexToEntry(filtered, state.turnIndex, state);
      pushLog(
        state,
        'ACTION',
        `유닛 삭제: ${removedName}${suffix}.`,
        action,
        ctx,
      );
      return;
    }

    case 'SET_TURN_ORDER': {
      const ctx = makeLogCtx(state);
      const activeKey = getTurnEntryKey(getActiveTurnEntry(state).entry);

      const nextGroups = normalizeTurnGroups(state, (action as any).turnGroups);
      state.turnGroups = nextGroups;

      const groupedUnitIds = new Set<string>();
      for (const g of nextGroups) {
        for (const unitId of g.unitIds) groupedUnitIds.add(unitId);
      }

      const unitMap = new Map<string, Unit>();
      for (const u of state.units ?? []) unitMap.set(u.id, u);
      const markerIds = new Set((state.markers ?? []).map((m: any) => m.id));

      const nextOrder: TurnEntry[] = [];
      const seenKeys = new Set<string>();
      const pushEntry = (entry: TurnEntry) => {
        const key = getTurnEntryKey(entry);
        if (!key || seenKeys.has(key)) return;
        seenKeys.add(key);
        nextOrder.push(entry);
      };

      const rawOrder = Array.isArray(action.turnOrder) ? action.turnOrder : [];
      for (const raw of rawOrder) {
        if (!raw || typeof raw !== 'object') continue;
        const kind = (raw as any).kind;
        if (kind === 'label') {
          const text = String((raw as any).text ?? '').trim();
          if (text) pushEntry({ kind: 'label', text });
          continue;
        }
        if (kind === 'marker') {
          const markerId = String((raw as any).markerId ?? '').trim();
          if (markerId && markerIds.has(markerId)) {
            pushEntry({ kind: 'marker', markerId });
          }
          continue;
        }
        if (kind === 'group') {
          const groupId = String((raw as any).groupId ?? '').trim();
          if (groupId && nextGroups.some((g) => g.id === groupId)) {
            pushEntry({ kind: 'group', groupId });
          }
          continue;
        }
        if (kind === 'unit') {
          const unitId = String((raw as any).unitId ?? '').trim();
          const u = unitMap.get(unitId);
          if (!u) continue;
          if ((u as any).bench) continue;
          if (normalizeUnitType((u as any).unitType) !== 'NORMAL') continue;
          if (groupedUnitIds.has(unitId)) continue;
          pushEntry({ kind: 'unit', unitId });
        }
      }

      const eligibleUnits = (state.units ?? []).filter((u) => {
        if ((u as any).bench) return false;
        if (normalizeUnitType((u as any).unitType) !== 'NORMAL') return false;
        if (groupedUnitIds.has(u.id)) return false;
        return true;
      });

      for (const u of eligibleUnits) {
        const key = `unit:${u.id}`;
        if (seenKeys.has(key)) continue;
        pushEntry({ kind: 'unit', unitId: u.id });
      }

      for (const g of nextGroups) {
        const key = `group:${g.id}`;
        if (seenKeys.has(key)) continue;
        pushEntry({ kind: 'group', groupId: g.id });
      }

      state.turnOrder = nextOrder;

      if (nextOrder.length === 0) {
        state.turnIndex = 0;
      } else if (activeKey) {
        const idx = findTurnEntryIndex(nextOrder, activeKey);
        if (idx != null) {
          state.turnIndex = idx;
        } else {
          state.turnIndex = clampTurnIndex(nextOrder, state.turnIndex);
          state.turnIndex = coerceTurnIndexToEntry(
            nextOrder,
            state.turnIndex,
            state,
          );
        }
      } else {
        state.turnIndex = clampTurnIndex(nextOrder, state.turnIndex);
        state.turnIndex = coerceTurnIndexToEntry(
          nextOrder,
          state.turnIndex,
          state,
        );
      }

      pushLog(state, 'ACTION', '턴 순서/그룹 변경.', action, ctx);
      return;
    }

    case 'MOVE_TURN_ENTRY': {
      const ctx = makeLogCtx(state);

      const order = Array.isArray(state.turnOrder) ? state.turnOrder : [];
      const len = order.length;
      if (len <= 1) return;

      const from = clampTurnIndex(order, action.fromIndex);
      const to = clampTurnIndex(order, action.toIndex);
      if (from === to) return;

      // turnIndex는 "메인 턴 포인터"니까, 이동으로 인해 가리키는 엔트리가 바뀌지 않게 보정
      const tiBefore = clampTurnIndex(order, state.turnIndex);
      const tiAfter = adjustIndexAfterMove(tiBefore, from, to);

      // 실제 이동
      state.turnOrder = moveArrayItem(order, from, to);

      // label은 턴 주체가 아니므로, turnIndex가 label을 가리키면 가까운 unit으로 보정
      state.turnIndex = clampTurnIndex(state.turnOrder, tiAfter);
      state.turnIndex = coerceTurnIndexToEntry(
        state.turnOrder,
        state.turnIndex,
        state,
      );

      // 로그(원하면 더 자세히: moved entry 이름도 찍기)
      pushLog(state, 'ACTION', `턴 순서 변경: ${from} → ${to}.`, action, ctx);
      return;
    }

    case 'SET_UNIT_LIST_ORDER': {
      const rawIds = Array.isArray(action.unitIds) ? action.unitIds : [];
      if (rawIds.length === 0) return;

      const unitMap = new Map<string, Unit>();
      for (const u of state.units ?? []) unitMap.set(u.id, u);

      const nextOrder: string[] = [];
      const seen = new Set<string>();
      for (const raw of rawIds) {
        const id = (raw ?? '').trim();
        if (!id || seen.has(id)) continue;
        if (!unitMap.has(id)) continue;
        seen.add(id);
        nextOrder.push(id);
      }

      for (const u of state.units ?? []) {
        if (seen.has(u.id)) continue;
        nextOrder.push(u.id);
      }

      if (nextOrder.length === 0) return;

      const nextUnits: Unit[] = [];
      for (const id of nextOrder) {
        const u = unitMap.get(id);
        if (u) nextUnits.push(u);
      }
      state.units = nextUnits;
      return;
    }



    case 'SET_UNIT_BENCH': {
      const ctx = makeLogCtx(state);

      const id = (action.unitId ?? '').trim();
      if (!id) return;

      if (!('bench' in action)) return;

      const u = findUnit(state, id);
      normalizeUnit(u);

      const prevBench = u.bench;
      const rawBench = action.bench as any;
      let nextBench: 'TEAM' | 'ENEMY' | undefined = undefined;
      if (rawBench === 'TEAM' || rawBench === 'ENEMY') {
        nextBench = rawBench;
      } else if (rawBench === null) {
        nextBench = undefined;
      } else {
        return;
      }

      if (prevBench === nextBench) return;

      if (nextBench) {
        u.bench = nextBench;
        const servants = getServants(state, id);
        if (servants.length) {
          for (const s of servants) {
            s.bench = nextBench;
            removeUnitFromTurnOrder(state, s.id);
          }
        }

        removeUnitFromTurnGroups(state, id);

        if (state.tempTurnStack?.length) {
          state.tempTurnStack = state.tempTurnStack.filter((x) => x !== id);
          if (state.tempTurnStack.length === 0) delete state.tempTurnStack;
        }

        const order = Array.isArray(state.turnOrder) ? state.turnOrder : [];
        const activeKey = getTurnEntryKey(getActiveTurnEntry(state).entry);

        const filtered = order.filter((t: any) => {
          if (t?.kind === 'label') return true;
          if (t?.kind === 'marker') return true;
          if (t?.kind === 'unit') return t.unitId !== id;
          return false;
        });

        state.turnOrder = filtered;

        if (filtered.length === 0) {
          state.turnIndex = 0;
        } else if (activeKey) {
          const idx = findTurnEntryIndex(filtered, activeKey);
          if (idx != null) {
            state.turnIndex = idx;
          } else {
            state.turnIndex = clampTurnIndex(filtered, state.turnIndex);
            state.turnIndex = coerceTurnIndexToEntry(
              filtered,
              state.turnIndex,
              state,
            );
          }
        } else {
          state.turnIndex = clampTurnIndex(filtered, state.turnIndex);
          state.turnIndex = coerceTurnIndexToEntry(
            filtered,
            state.turnIndex,
            state,
          );
        }

        pushLog(
          state,
          'ACTION',
          `${unitLabel(state, id)} 대기석 이동: ${nextBench} 대기석.`,
          action,
          ctx,
        );
        return;
      }

      delete u.bench;
      const servants = getServants(state, id);
      if (servants.length) {
        for (const s of servants) {
          delete s.bench;
          removeUnitFromTurnOrder(state, s.id);
        }
      }
      state.turnOrder ??= [];
      if (normalizeUnitType((u as any).unitType) === 'NORMAL') {
        state.turnOrder.push({ kind: 'unit', unitId: id });
        if (typeof state.turnIndex !== 'number') state.turnIndex = 0;
        state.turnIndex = clampTurnIndex(state.turnOrder, state.turnIndex);
        state.turnIndex = coerceTurnIndexToEntry(
          state.turnOrder,
          state.turnIndex,
          state,
        );
      }

      pushLog(
        state,
        'ACTION',
        `${unitLabel(state, id)} 투입 (대기석 해제).`,
        action,
        ctx,
      );
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

function ensureRound(state: EncounterState) {
  const r = Math.floor((state as any).round ?? 0);
  (state as any).round = Number.isFinite(r) && r >= 1 ? r : 1;
}

function findUnit(state: EncounterState, unitId: string): Unit {
  const u = state.units.find((x) => x.id === unitId);
  if (!u) throw new Error(`unit not found: ${unitId}`);
  return u;
}

function isTurnDisabled(state: EncounterState, unitId: string): boolean {
  const u = state.units.find((x) => x.id === unitId);
  if (!u) return false;
  if (normalizeUnitType((u as any).unitType) !== 'NORMAL') return true;
  return !!u.turnDisabled;
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

function clampIndex(v: any, len: number): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return len; // 기본: 맨 뒤
  return Math.max(0, Math.min(len, n));
}

function normalizeAnsiColorCode(v: any): number | undefined {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return undefined;
  const ok = (n >= 30 && n <= 37) || (n >= 90 && n <= 97) || n === 39;
  return ok ? n : undefined;
}

function isSide(v: any): v is Side {
  return v === 'TEAM' || v === 'ENEMY' || v === 'NEUTRAL';
}

function isUnitType(v: any): v is UnitType {
  return v === 'NORMAL' || v === 'SERVANT' || v === 'BUILDING';
}

function normalizeUnitType(v: any): UnitType {
  return isUnitType(v) ? v : 'NORMAL';
}

function getTurnGroup(state: EncounterState, groupId: string): TurnGroup | null {
  if (!groupId) return null;
  const groups = Array.isArray(state.turnGroups) ? state.turnGroups : [];
  return groups.find((g) => g.id === groupId) ?? null;
}

function groupLabel(state: EncounterState, groupId: string): string {
  const g = getTurnGroup(state, groupId);
  return g?.name ?? groupId;
}

function turnEntryLabel(state: EncounterState, entry: TurnEntry): string | null {
  if (entry.kind === 'unit') return unitLabel(state, entry.unitId);
  if (entry.kind === 'group') return groupLabel(state, entry.groupId);
  return null;
}

function getGroupTurnUnits(state: EncounterState, groupId: string): Unit[] {
  const group = getTurnGroup(state, groupId);
  if (!group) return [];

  const out: Unit[] = [];
  for (const rawId of group.unitIds ?? []) {
    const id = String(rawId ?? '').trim();
    if (!id) continue;
    const u = state.units.find((x) => x.id === id);
    if (!u) continue;
    if ((u as any).bench) continue;
    if (normalizeUnitType((u as any).unitType) !== 'NORMAL') continue;
    if (isTurnDisabled(state, u.id)) continue;
    out.push(u);
  }
  return out;
}

function normalizeTurnGroups(
  state: EncounterState,
  rawGroups: any,
): TurnGroup[] {
  const input = Array.isArray(rawGroups) ? rawGroups : [];
  const out: TurnGroup[] = [];
  const seenGroupIds = new Set<string>();
  const usedUnitIds = new Set<string>();

  for (const raw of input) {
    const id = String(raw?.id ?? '').trim();
    if (!id || seenGroupIds.has(id)) continue;
    seenGroupIds.add(id);

    const name = String(raw?.name ?? '').trim() || id;
    const unitIdsRaw = Array.isArray(raw?.unitIds) ? raw.unitIds : [];
    const unitIds: string[] = [];
    const seenUnits = new Set<string>();

    for (const rawId of unitIdsRaw) {
      const unitId = String(rawId ?? '').trim();
      if (!unitId || seenUnits.has(unitId) || usedUnitIds.has(unitId)) continue;
      const u = state.units.find((x) => x.id === unitId);
      if (!u) continue;
      if ((u as any).bench) continue;
      if (normalizeUnitType((u as any).unitType) !== 'NORMAL') continue;
      if (isTurnDisabled(state, u.id)) continue;
      seenUnits.add(unitId);
      usedUnitIds.add(unitId);
      unitIds.push(unitId);
    }

    if (unitIds.length === 0) continue;
    out.push({ id, name, unitIds });
  }

  return out;
}

function removeGroupEntriesFromOrder(state: EncounterState, groupIds: Set<string>) {
  if (!state.turnOrder?.length || groupIds.size === 0) return;
  state.turnOrder = state.turnOrder.filter((t) => {
    if (t?.kind === 'group') return !groupIds.has(t.groupId);
    return true;
  });
}

function removeUnitFromTurnGroups(state: EncounterState, unitId: string) {
  if (!state.turnGroups?.length) return;
  const removedGroupIds = new Set<string>();

  const nextGroups: TurnGroup[] = [];
  for (const g of state.turnGroups) {
    const filtered = (g.unitIds ?? []).filter((id) => id !== unitId);
    if (filtered.length === 0) {
      removedGroupIds.add(g.id);
      continue;
    }
    if (filtered.length !== g.unitIds.length) {
      nextGroups.push({ ...g, unitIds: filtered });
    } else {
      nextGroups.push(g);
    }
  }

  state.turnGroups = nextGroups;
  if (removedGroupIds.size) {
    removeGroupEntriesFromOrder(state, removedGroupIds);
  }
}

function clampTurnIndex(order: TurnEntry[], idx: any): number {
  if (!Array.isArray(order) || order.length === 0) return 0;
  const n = Math.floor(Number(idx));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(order.length - 1, n));
}

function isTurnEntryActive(
  state: EncounterState | undefined,
  entry: TurnEntry,
): boolean {
  if (!state) return entry?.kind === 'unit' || entry?.kind === 'group';

  if (entry?.kind === 'unit') {
    return !isTurnDisabled(state, entry.unitId);
  }

  if (entry?.kind === 'group') {
    return getGroupTurnUnits(state, entry.groupId).length > 0;
  }

  return false;
}

function getTurnEntryIndices(
  order: TurnEntry[],
  state?: EncounterState,
): number[] {
  const out: number[] = [];
  for (let i = 0; i < order.length; i++) {
    const entry = order[i];
    if (!entry) continue;
    if (!isTurnEntryActive(state, entry)) continue;
    out.push(i);
  }
  return out;
}

function getTurnEntryKey(entry: TurnEntry | null | undefined): string | null {
  if (!entry) return null;
  if (entry.kind === 'unit') return `unit:${entry.unitId}`;
  if (entry.kind === 'group') return `group:${entry.groupId}`;
  if (entry.kind === 'marker') return `marker:${entry.markerId}`;
  if (entry.kind === 'label') return `label:${entry.text}`;
  return null;
}

function findTurnEntryIndex(order: TurnEntry[], key: string): number | null {
  if (!key) return null;
  for (let i = 0; i < order.length; i++) {
    if (getTurnEntryKey(order[i]) === key) return i;
  }
  return null;
}

function getMarkerIdsBetween(
  order: TurnEntry[],
  fromIdx: number,
  toIdx: number,
): string[] {
  if (!Array.isArray(order) || order.length === 0) return [];
  const out: string[] = [];
  const seen = new Set<string>();

  let i = (fromIdx + 1) % order.length;
  const start = i;

  while (true) {
    const t = order[i];
    if (t?.kind === 'marker' && t.markerId) {
      if (!seen.has(t.markerId)) {
        seen.add(t.markerId);
        out.push(t.markerId);
      }
    }

    if (i === toIdx) break;
    i = (i + 1) % order.length;
    if (i === start) break;
  }

  return out;
}

function getDisabledUnitIdsBetween(
  order: TurnEntry[],
  fromIdx: number,
  toIdx: number,
  state: EncounterState,
): string[] {
  if (!Array.isArray(order) || order.length === 0) return [];
  const out: string[] = [];

  let i = (fromIdx + 1) % order.length;
  const start = i;

  while (true) {
    const t = order[i];
    if (t?.kind === 'unit') {
      const u = state.units.find((x) => x.id === t.unitId);
      if (u) {
        if (normalizeUnitType((u as any).unitType) === 'NORMAL' && u.turnDisabled) {
          out.push(t.unitId);
        }
      }
    }

    if (i === toIdx) break;
    i = (i + 1) % order.length;
    if (i === start) break;
  }

  return out;
}

function removeMarkerEntriesFromOrder(
  state: EncounterState,
  markerIds: Set<string>,
) {
  if (!state.turnOrder?.length || markerIds.size === 0) return;

  let removedBefore = 0;
  const filtered = state.turnOrder.filter((t, idx) => {
    if (t?.kind === 'marker' && markerIds.has(t.markerId)) {
      if (idx < state.turnIndex) removedBefore++;
      return false;
    }
    return true;
  });

  if (filtered.length === state.turnOrder.length) return;

  state.turnOrder = filtered;

  if (removedBefore) {
    state.turnIndex = Math.max(0, state.turnIndex - removedBefore);
  }

  state.turnIndex = clampTurnIndex(state.turnOrder, state.turnIndex);
  state.turnIndex = coerceTurnIndexToEntry(
    state.turnOrder,
    state.turnIndex,
    state,
  );
}

function tickMarkersOnPass(
  state: EncounterState,
  markerIds: string[],
  action?: Action,
  ctxOverride?: EncounterLogEntry['ctx'],
) {
  if (!state.markers?.length || markerIds.length === 0) return;

  const decays: string[] = [];
  const removed: { id: string; name: string }[] = [];
  const missingIds: string[] = [];

  for (const markerId of markerIds) {
    const m = state.markers.find((x) => x.id === markerId);
    if (!m) {
      missingIds.push(markerId);
      continue;
    }

    const duration = Math.floor(Number(m.duration ?? 0));
    if (!Number.isFinite(duration) || duration <= 0) continue;

    const next = duration - 1;
    if (next <= 0) {
      removed.push({ id: m.id, name: m.name });
      continue;
    }

    m.duration = next;
    decays.push(`${m.name}(${m.id}) ${duration}->${next}`);
  }

  const idsToRemove = new Set<string>([
    ...missingIds,
    ...removed.map((m) => m.id),
  ]);

  if (idsToRemove.size) {
    state.markers = state.markers.filter((m) => !idsToRemove.has(m.id));
    removeMarkerEntriesFromOrder(state, idsToRemove);
  }

  const ctx = ctxOverride ?? makeLogCtx(state);

  if (decays.length) {
    pushLog(
      state,
      'ACTION',
      `Marker duration: ${decays.join(', ')}.`,
      action,
      ctx,
    );
  }

  if (removed.length) {
    const names = removed.map((m) => `${m.name}(${m.id})`).join(', ');
    pushLog(state, 'ACTION', `Marker expired: ${names}.`, action, ctx);
  }
}

/** turnIndex가 label이면, start부터 뒤로 가며 unit을 찾고 없으면 첫 unit */
function coerceTurnIndexToEntry(
  order: TurnEntry[],
  start: any,
  state?: EncounterState,
): number {
  if (!Array.isArray(order) || order.length === 0) return 0;

  const entryIdxs = getTurnEntryIndices(order, state);
  if (entryIdxs.length === 0) return 0;

  const s = clampTurnIndex(order, start);

  for (let i = s; i < order.length; i++) {
    const entry = order[i];
    if (!entry) continue;
    if (!isTurnEntryActive(state, entry)) continue;
    return i;
  }
  return entryIdxs[0];
}

function getActiveTurnEntry(
  state: EncounterState,
): { isTemp: boolean; entry: TurnEntry | null } {
  if (!state.battleStarted) return { isTemp: false, entry: null };
  const top = state.tempTurnStack?.length
    ? state.tempTurnStack[state.tempTurnStack.length - 1]
    : null;

  if (top) {
    return { isTemp: true, entry: { kind: 'unit', unitId: top } };
  }

  const order = Array.isArray(state.turnOrder) ? state.turnOrder : [];
  if (order.length === 0) return { isTemp: false, entry: null };

  const entryIdxs = getTurnEntryIndices(order, state);
  if (entryIdxs.length === 0) return { isTemp: false, entry: null };

  state.turnIndex = coerceTurnIndexToEntry(order, state.turnIndex, state);
  const entry = order[state.turnIndex];
  if (!entry) return { isTemp: false, entry: null };
  if (!isTurnEntryActive(state, entry)) return { isTemp: false, entry: null };
  return { isTemp: false, entry };
}

function findNextTurnEntryIndex(
  order: TurnEntry[],
  fromIdx: number,
  state?: EncounterState,
): number | null {
  if (!Array.isArray(order) || order.length === 0) return null;
  const n = order.length;

  for (let step = 1; step <= n; step++) {
    const j = (fromIdx + step) % n;
    const entry = order[j];
    if (!entry) continue;
    if (!isTurnEntryActive(state, entry)) continue;
    return j;
  }
  return null;
}

function decTurnTags(u: Unit, when: 'start' | 'end'): TurnTagDecayChange[] {
  if (!u.tagStates) return [];

  const changes: TurnTagDecayChange[] = [];

  for (const [k, st] of Object.entries(u.tagStates)) {
    const stacks = clampTagStacks(st?.stacks ?? 0);
    if (stacks <= 0) {
      delete u.tagStates[k];
      continue;
    }

    const dec = when === 'start' ? !!st.decOnTurnStart : !!st.decOnTurnEnd;
    if (!dec) continue;

    const next = stacks - 1;

    changes.push({
      tag: k,
      from: stacks,
      to: Math.max(0, next),
      when,
    });

    if (next <= 0) delete u.tagStates[k];
    else u.tagStates[k] = { ...st, stacks: next };
  }

  if (Object.keys(u.tagStates).length === 0) delete u.tagStates;

  return changes;
}

function getServants(state: EncounterState, masterId: string): Unit[] {
  return (state.units ?? []).filter((u) => {
    const master = (u as any).masterUnitId;
    if (master !== masterId) return false;
    const t = normalizeUnitType((u as any).unitType);
    if (t === 'BUILDING') return false;
    return t === 'SERVANT' || t === 'NORMAL';
  });
}

function applyServantTagDecays(
  state: EncounterState,
  masterId: string,
  when: 'start' | 'end',
  action?: Action,
  ctxOverride?: EncounterLogEntry['ctx'],
) {
  const servants = getServants(state, masterId);
  if (!servants.length) return;

  for (const u of servants) {
    normalizeUnit(u);
    const changes = decTurnTags(u, when);
    if (!changes.length) continue;

    const txt = changes.map((c) => `${c.tag} ${c.from}→${c.to}`).join(', ');
    const label = when === 'start' ? '턴 시작' : '턴 종료';
    pushLog(
      state,
      'ACTION',
      `${unitLabel(state, u.id)} 태그 자동감소(${label}): ${txt}.`,
      action,
      ctxOverride,
    );
  }
}

function applyGroupTurnDecays(
  state: EncounterState,
  groupId: string,
  when: 'start' | 'end',
  action?: Action,
  ctxOverride?: EncounterLogEntry['ctx'],
) {
  const members = getGroupTurnUnits(state, groupId);
  if (!members.length) return;

  for (const u of members) {
    normalizeUnit(u);
    const changes = decTurnTags(u, when);
    if (changes.length) {
      const txt = changes.map((c) => `${c.tag} ${c.from}→${c.to}`).join(', ');
      const label = when === 'start' ? '턴 시작' : '턴 종료';
      pushLog(
        state,
        'ACTION',
        `${unitLabel(state, u.id)} 태그 자동감소(${label}): ${txt}.`,
        action,
        ctxOverride,
      );
    }

    applyServantTagDecays(state, u.id, when, action, ctxOverride);
  }
}

function removeUnitFromTurnOrder(state: EncounterState, unitId: string) {
  if (state.tempTurnStack?.length) {
    state.tempTurnStack = state.tempTurnStack.filter((x) => x !== unitId);
    if (state.tempTurnStack.length === 0) delete state.tempTurnStack;
  }

  removeUnitFromTurnGroups(state, unitId);

  const order = Array.isArray(state.turnOrder) ? state.turnOrder : [];
  if (order.length === 0) return;

  const activeKey = getTurnEntryKey(getActiveTurnEntry(state).entry);

  const filtered = order.filter((t: any) => {
    if (t?.kind === 'unit') return t.unitId !== unitId;
    return true;
  });

  if (filtered.length === order.length) return;
  state.turnOrder = filtered;

  if (filtered.length === 0) {
    state.turnIndex = 0;
    return;
  }

  if (activeKey) {
    const idx = findTurnEntryIndex(filtered, activeKey);
    if (idx != null) {
      state.turnIndex = idx;
      return;
    }
  }

  state.turnIndex = clampTurnIndex(filtered, state.turnIndex);
  state.turnIndex = coerceTurnIndexToEntry(filtered, state.turnIndex, state);
}

function safeRound(state: EncounterState): number {
  const r = Math.floor((state as any).round ?? 1);
  return Number.isFinite(r) && r >= 1 ? r : 1;
}

function getActiveTurnCtx(state: EncounterState): {
  isTemp: boolean;
  unitId: string | null;
} {
  if (!state.battleStarted) return { isTemp: false, unitId: null };
  const active = getActiveTurnEntry(state);
  const entry = active.entry;
  if (!entry) return { isTemp: false, unitId: null };
  const entryId =
    entry.kind === 'unit' ? entry.unitId : entry.kind === 'group' ? entry.groupId : null;
  return { isTemp: active.isTemp, unitId: entryId };
}

function resolveUnitName(
  state: EncounterState,
  unitId: string | null,
): string | null {
  if (!unitId) return null;
  const u = state.units.find((x) => x.id === unitId);
  if (u?.name) return u.name;
  const g = Array.isArray(state.turnGroups)
    ? state.turnGroups.find((x) => x.id === unitId)
    : null;
  return g?.name ?? unitId;
}

function makeUnitCtx(
  state: EncounterState,
  unitId: string,
): EncounterLogEntry['ctx'] {
  return {
    round: safeRound(state),
    isTemp: false,
    unitId,
    unitName: resolveUnitName(state, unitId),
  };
}

function makeLogCtx(state: EncounterState): EncounterLogEntry['ctx'] {
  const { isTemp, unitId } = getActiveTurnCtx(state);
  return {
    round: safeRound(state),
    isTemp,
    unitId,
    unitName: resolveUnitName(state, unitId),
  };
}

function prefixFromCtx(ctx: EncounterLogEntry['ctx']): string {
  const who = ctx.unitName ?? ctx.unitId ?? '-';
  const temp = ctx.isTemp ? '(임시턴) ' : '';
  return `[${ctx.round}라운드, ${temp}${who} 턴]`;
}

function pushLog(
  state: EncounterState,
  kind: LogKind,
  message: string,
  action?: Action,
  ctxOverride?: EncounterLogEntry['ctx'],
) {
  const ctx = ctxOverride ?? makeLogCtx(state);
  const entry: EncounterLogEntry = {
    id: randomUUID(),
    at: new Date().toISOString(),
    kind,
    ctx,
    line: `${prefixFromCtx(ctx)} ${message}`,
    action,
  };

  state.logs ??= [];
  state.logs.push(entry);

  if (state.logs.length > MAX_LOGS) {
    state.logs.splice(0, state.logs.length - MAX_LOGS);
  }
}

function unitLabel(state: EncounterState, id: string): string {
  return state.units.find((u) => u.id === id)?.name ?? id;
}

function fmtPos(p?: { x: number; z: number }) {
  if (!p) return '(x=?, z=?)';
  return `(x=${p.x}, z=${p.z})`;
}

function formatMoveDelta(dx: number, dz: number): string {
  // Translate delta into human-readable directions for logs (3m per cell).
  const step = 3;
  const parts: string[] = [];
  if (dx !== 0) {
    const dir = dx > 0 ? '오른쪽' : '왼쪽';
    parts.push(`${dir}으로 ${Math.abs(dx) * step}m 이동`);
  }
  if (dz !== 0) {
    const dir = dz > 0 ? '위' : '아래';
    const verb = dz > 0 ? '상승' : '하강';
    parts.push(`${dir}로 ${Math.abs(dz) * step}m ${verb}`);
  }
  return parts.join(', ');
}

function diffManualTags(before: string[], after: string[]) {
  const b = new Set(before.map((x) => (x ?? '').trim()).filter(Boolean));
  const a = new Set(after.map((x) => (x ?? '').trim()).filter(Boolean));

  const added: string[] = [];
  const removed: string[] = [];

  for (const t of a) if (!b.has(t)) added.push(t);
  for (const t of b) if (!a.has(t)) removed.push(t);

  return { added, removed };
}

function diffTagStates(
  before?: Record<string, any>,
  after?: Record<string, any>,
): string[] {
  const out: string[] = [];
  const b = before ?? {};
  const a = after ?? {};

  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  for (const k of keys) {
    const bs = b[k];
    const as = a[k];

    if (!bs && as) {
      out.push(
        `${k} 추가(${as.stacks}${
          as.decOnTurnStart ? ', 시작감소' : ''
        }${as.decOnTurnEnd ? ', 종료감소' : ''})`,
      );
      continue;
    }
    if (bs && !as) {
      out.push(`${k} 제거`);
      continue;
    }
    if (!bs || !as) continue;

    const changes: string[] = [];
    if (bs.stacks !== as.stacks) changes.push(`${bs.stacks}→${as.stacks}`);
    if (!!bs.decOnTurnStart !== !!as.decOnTurnStart)
      changes.push(`시작감소:${!!as.decOnTurnStart ? 'ON' : 'OFF'}`);
    if (!!bs.decOnTurnEnd !== !!as.decOnTurnEnd)
      changes.push(`종료감소:${!!as.decOnTurnEnd ? 'ON' : 'OFF'}`);

    if (changes.length) out.push(`${k} (${changes.join(', ')})`);
  }

  return out;
}

function moveArrayItem<T>(arr: T[], from: number, to: number): T[] {
  const next = arr.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * from->to 이동 시, 기존 index가 가리키던 "같은 항목"을 계속 가리키도록 index 보정
 */
function adjustIndexAfterMove(
  curIndex: number,
  from: number,
  to: number,
): number {
  if (curIndex === from) return to;

  // from이 curIndex 앞에서 빠지고 to가 curIndex 뒤에 들어오면 curIndex는 한 칸 당겨짐
  if (from < curIndex && curIndex <= to) return curIndex - 1;

  // from이 curIndex 뒤에서 빠지고 to가 curIndex 앞에 들어오면 curIndex는 한 칸 밀림
  if (to <= curIndex && curIndex < from) return curIndex + 1;

  return curIndex;
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

function clampTagStacks(v: number): number {
  const n = Math.floor(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MAX_TAG_STACKS, n));
}

function applyTagStacksPatch(cur: number, op: TagStacksPatch): number {
  if (op === null) return 0;
  if (typeof op === 'number') return clampTagStacks(op);
  return clampTagStacks(cur + Math.floor(op.delta ?? 0));
}

function applyUnitPatch(u: Unit, patch: UnitPatch) {
  if (patch.name !== undefined) u.name = patch.name;

  if (patch.side !== undefined && isSide(patch.side)) {
    u.side = patch.side;
  }

  if (patch.alias !== undefined) {
    if (patch.alias === null) {
      delete (u as any).alias;
    } else {
      const trimmed = String(patch.alias ?? '').trim();
      if (trimmed) (u as any).alias = trimmed;
      else delete (u as any).alias;
    }
  }

  if (patch.note !== undefined) {
    if (patch.note === null) delete u.note;
    else u.note = patch.note;
  }

  if (patch.colorCode !== undefined) {
    if (patch.colorCode === null) delete u.colorCode;
    else u.colorCode = Math.floor(patch.colorCode);
  }

  if (patch.hidden !== undefined) {
    if (patch.hidden === null || patch.hidden === false) {
      delete u.hidden;
    } else {
      u.hidden = true;
    }
  }

  if (patch.turnDisabled !== undefined) {
    if (patch.turnDisabled === null || patch.turnDisabled === false) {
      delete u.turnDisabled;
    } else {
      u.turnDisabled = true;
    }
  }

  if (patch.bench !== undefined) {
    if (patch.bench === null) {
      delete u.bench;
    } else if (patch.bench === 'TEAM' || patch.bench === 'ENEMY') {
      u.bench = patch.bench;
    }
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

  if (patch.spellSlots !== undefined) {
    u.spellSlots ??= {};
    for (const [k, v] of Object.entries(patch.spellSlots)) {
      const lvl = Math.floor(Number(k));
      if (!Number.isFinite(lvl) || lvl < 1 || lvl > 9) continue;
      if (v === null) {
        delete u.spellSlots[lvl];
        continue;
      }
      const n = Math.max(0, Math.floor(Number(v)));
      u.spellSlots[lvl] = n;
    }
    if (Object.keys(u.spellSlots).length === 0) delete u.spellSlots;
  }

  if (patch.consumables !== undefined) {
    u.consumables ??= {};
    for (const [rawKey, v] of Object.entries(patch.consumables)) {
      const key = (rawKey ?? '').trim();
      if (!key) continue;
      if (v === null) {
        delete u.consumables[key];
        continue;
      }
      const n = Math.max(0, Math.floor(Number(v)));
      u.consumables[key] = n;
    }
    if (Object.keys(u.consumables).length === 0) delete u.consumables;
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

  // preset 스택/토글
  if (patch.presetStacks) {
    for (const [presetId, op] of Object.entries(patch.presetStacks)) {
      const preset = getPreset(presetId);

      const cur = clampStacks(getStacks(u, preset.id), preset.maxStacks);
      let desiredRaw: number;

      if (op === null) desiredRaw = 0;
      else if (typeof op === 'number') desiredRaw = op;
      else desiredRaw = cur + Math.floor(op.delta ?? 0);

      const desired = clampStacks(desiredRaw, preset.maxStacks);

      if (desired <= 0) {
        removeMod(u, preset.id);
        continue;
      }

      if (preset.kind === 'toggle') {
        const stacks = 1;
        const modBody = preset.buildMod({ target: u, stacks, args: undefined });
        upsertMod(u, { key: preset.id, stacks, ...modBody });
      } else {
        const stacks = desired;
        const modBody = preset.buildMod({ target: u, stacks, args: undefined });
        upsertMod(u, { key: preset.id, stacks, ...modBody });
      }
    }
  }

  // 턴 기반 태그(tagStates)
  if (patch.tagStates) {
    u.tagStates ??= {};

    for (const [tagKeyRaw, tagOpRaw] of Object.entries(patch.tagStates)) {
      const tagKey = (tagKeyRaw ?? '').trim();
      if (!tagKey) continue;

      if (tagOpRaw === null) {
        delete u.tagStates[tagKey];
        continue;
      }

      const tagOp = tagOpRaw as any;

      const curState = u.tagStates[tagKey];
      const curStacks = curState ? clampTagStacks(curState.stacks) : 0;

      let nextStacks = curStacks;
      if (tagOp.stacks !== undefined) {
        nextStacks = applyTagStacksPatch(curStacks || 1, tagOp.stacks);
      } else if (!curState) {
        nextStacks = 1;
      }

      if (nextStacks <= 0) {
        delete u.tagStates[tagKey];
        continue;
      }

      u.tagStates[tagKey] = {
        stacks: nextStacks,
        decOnTurnStart:
          tagOp.decOnTurnStart !== undefined
            ? !!tagOp.decOnTurnStart
            : curState?.decOnTurnStart,
        decOnTurnEnd:
          tagOp.decOnTurnEnd !== undefined
            ? !!tagOp.decOnTurnEnd
            : curState?.decOnTurnEnd,
      };
    }

    if (Object.keys(u.tagStates).length === 0) delete u.tagStates;
  }
}

