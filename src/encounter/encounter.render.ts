// encounter.render.ts
import { EncounterState, Unit } from './encounter.types';
import {
  getAcBreakdown,
  getComputedAc,
  getComputedIntegrity,
  getDisplayTags,
} from './encounter.compute';
import { buildFormationLines } from './encounter.formation';

const RESET = '\x1b[0m';
const GRAY = '\x1b[0;37m';
const AC_COLOR = '\x1b[0;38m';

function color(code: number) {
  return `\x1b[1;${code}m`;
}

const DEATH_SUCCESS_COLOR = color(36); // cyan
const DEATH_FAILURE_COLOR = color(31); // red
const SLOT_COLOR = color(34); // blue
const CONSUMABLE_COLOR = color(33); // yellow
const DISABLED_COLOR = '\x1b[1;30m';

function colorNumber(value: number | string, tint: string) {
  return `${tint}${value}${RESET}`;
}

type RenderOptions = {
  hideBench?: boolean;
  hideBenchTeam?: boolean;
  hideBenchEnemy?: boolean;
};

function unitColor(u: Unit) {
  if (typeof u.colorCode === 'number') return color(u.colorCode);
  const bench = (u as any).bench;
  if (bench === 'TEAM') return color(34);
  if (bench === 'ENEMY') return color(31);
  if (u.side === 'TEAM') return color(34);
  if (u.side === 'ENEMY') return color(31);
  return color(90); // NEUTRAL
}

function normalizeUnitType(u: Unit): 'NORMAL' | 'SERVANT' | 'BUILDING' {
  const t = (u as any).unitType;
  if (t === 'SERVANT' || t === 'BUILDING' || t === 'NORMAL') return t;
  return 'NORMAL';
}

function unitTypePrefix(u: Unit): string {
  const t = normalizeUnitType(u);
  if (t === 'SERVANT') return '[S]';
  if (t === 'BUILDING') return '[B]';
  return '';
}

function formatUnitLabel(u: Unit, base: string): string {
  const prefix = unitTypePrefix(u);
  return prefix ? `${prefix}${base}` : base;
}

function groupLabel(state: EncounterState, groupId: string): string {
  const g = Array.isArray(state.turnGroups)
    ? state.turnGroups.find((x) => x.id === groupId)
    : null;
  return g?.name ?? groupId;
}

function groupHasMembers(state: EncounterState, groupId: string): boolean {
  const g = Array.isArray(state.turnGroups)
    ? state.turnGroups.find((x) => x.id === groupId)
    : null;
  if (!g) return false;
  if (!Array.isArray(g.unitIds) || g.unitIds.length === 0) return false;
  for (const id of g.unitIds) {
    const u = state.units.find((x) => x.id === id);
    if (!u) continue;
    if ((u as any)?.bench) continue;
    if (normalizeUnitType(u) !== 'NORMAL') continue;
    if (u.turnDisabled) continue;
    return true;
  }
  return false;
}

function fmtTags(u: Unit) {
  const base = getDisplayTags(u);

  const seen = new Set<string>();
  const all: string[] = [];
  for (const t of base) {
    const s = (t ?? '').trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    all.push(s);
  }

  if (!all.length) return '';
  return ' ' + all.map((t) => `(${t})`).join(' ');
}

function fmtSpellSlots(u: Unit): string {
  // 슬롯은 1..최고레벨까지 이어서 표시 (누락 레벨은 0으로 간주)
  const slots = (u as any).spellSlots as Record<string, number> | undefined;
  if (!slots) return '';

  const levels = Object.keys(slots)
    .map((k) => Math.floor(Number(k)))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 9)
    .sort((a, b) => a - b);

  if (levels.length === 0) return '';

  const max = levels[levels.length - 1];
  const parts: string[] = [];
  for (let lvl = 1; lvl <= max; lvl++) {
    const raw = (slots as any)[lvl] ?? (slots as any)[String(lvl)] ?? 0;
    const n = Math.max(0, Math.floor(Number(raw)));
    parts.push(colorNumber(n, SLOT_COLOR));
  }
  return `[${parts.join('/')}]`;
}

function fmtConsumables(u: Unit): string {
  // 고유 소모값은 [이름 수량] 형태로 정렬해 표시
  const cons = (u as any).consumables as Record<string, number> | undefined;
  if (!cons) return '';

  const entries = Object.entries(cons)
    .map(([raw, count]) => [String(raw).trim(), count] as const)
    .filter(([name]) => name.length > 0)
    .sort((a, b) => a[0].localeCompare(b[0]));

  if (entries.length === 0) return '';

  return entries
    .map(([name, count]) => {
      const n = Math.max(0, Math.floor(Number(count ?? 0)));
      return `[${name} ${colorNumber(n, CONSUMABLE_COLOR)}]`;
    })
    .join(' ');
}

function fmtResources(u: Unit): string {
  const cons = fmtConsumables(u);
  const slots = fmtSpellSlots(u);
  if (!cons && !slots) return '';
  return ' ' + [cons, slots].filter(Boolean).join(' ');
}

function fmtDeathSaves(u: Unit): string {
  const success = Math.max(0, Math.floor(u.deathSaves?.success ?? 0));
  const failure = Math.max(0, Math.floor(u.deathSaves?.failure ?? 0));
  if (success === 0 && failure === 0) return '';
  return `(${colorNumber(success, DEATH_SUCCESS_COLOR)}, ${colorNumber(
    failure,
    DEATH_FAILURE_COLOR,
  )})`;
}

function fmtHp(u: Unit) {
  if (!u.hp) return '';
  const temp = u.hp.temp ? `+${u.hp.temp}` : '';
  const integ = getComputedIntegrity(u);
  const integStr = integ ? `(${integ})` : '';
  return `HP. ${u.hp.cur}/${u.hp.max}${temp}${integStr}`;
}

function fmtAc(u: Unit) {
  const { base, delta } = getAcBreakdown(u);
  if (typeof base !== 'number') return '';

  if (delta === 0) return `AC.${base}`;

  const ds = delta > 0 ? `+${delta}` : `${delta}`;
  return `AC.${base}(${ds})`;
}

export function renderAnsi(state: EncounterState, opts?: RenderOptions): string {
  const hideBench = !!opts?.hideBench;
  const hideBenchTeam = hideBench || !!opts?.hideBenchTeam;
  const hideBenchEnemy = hideBench || !!opts?.hideBenchEnemy;
  // Active units render in main sections; bench units are listed separately unless hidden.
  const activeUnits = (state.units ?? []).filter((u) => !(u as any).bench);
  const team = activeUnits.filter((u) => u.side === 'TEAM');
  const enemy = activeUnits.filter((u) => u.side === 'ENEMY');
  const neutral = activeUnits.filter((u) => u.side === 'NEUTRAL');
  const benchTeam = hideBenchTeam
    ? []
    : (state.units ?? []).filter((u) => (u as any).bench === 'TEAM');
  const benchEnemy = hideBenchEnemy
    ? []
    : (state.units ?? []).filter((u) => (u as any).bench === 'ENEMY');
  const sideNotes = (state as any).sideNotes ?? {};

  const lines: string[] = [];

  if (!state.battleStarted) {
    lines.push(`${color(31)}<전투 개시되지 않음>${RESET}`);
  }

  const teamNote = typeof sideNotes.TEAM === 'string' ? sideNotes.TEAM.trim() : '';
  const enemyNote = typeof sideNotes.ENEMY === 'string' ? sideNotes.ENEMY.trim() : '';
  const neutralNote =
    typeof sideNotes.NEUTRAL === 'string' ? sideNotes.NEUTRAL.trim() : '';

  lines.push(`${color(34)}Team${RESET}`);
  if (teamNote) lines.push(teamNote);
  for (const u of team) lines.push(renderUnitLine(u));
  if (benchTeam.length) {
    lines.push(`${DISABLED_COLOR}===============${RESET}`);
    for (const u of benchTeam) lines.push(renderUnitLine(u));
  }
  lines.push('');

  lines.push(`${color(31)}Enemy${RESET}`);
  if (enemyNote) lines.push(enemyNote);
  for (const u of enemy) lines.push(renderUnitLine(u));
  if (benchEnemy.length) {
    lines.push(`${DISABLED_COLOR}===============${RESET}`);
    for (const u of benchEnemy) lines.push(renderUnitLine(u));
  }
  lines.push('');

  if (neutral.length) {
    lines.push(`${color(90)}Neutral${RESET}`);
    if (neutralNote) lines.push(neutralNote);
    for (const u of neutral) lines.push(renderUnitLine(u));
    lines.push('');
  }

  const round = Math.floor((state as any).round ?? 1);
  const safeRound = Number.isFinite(round) && round >= 1 ? round : 1;
  const tempId = state.tempTurnStack?.length
    ? state.tempTurnStack[state.tempTurnStack.length - 1]
    : null;
  const tempUnit = tempId
    ? state.units.find((u) => u.id === tempId)
    : null;
  const tempName = tempUnit?.name ?? tempId ?? '';
  const tempSuffix = tempName ? ` - ${tempName}의 임시 턴` : '';
  lines.push(`${color(33)}Turn (Round ${safeRound})${tempSuffix}${RESET}`);

  lines.push(`${color(38)}${renderTurnLine(state)}${RESET}`);
  lines.push('');

  lines.push(`${color(39)}Formation${RESET}`);
  const formation = buildFormationLines(state, {
    formatUnitLabel: (u, label) => `${unitColor(u)}${label}${color(39)}`,
  });

  if (formation.length === 0) lines.push(`${color(39)}-${RESET}`);
  else for (const f of formation) lines.push(`${color(39)}${f}${RESET}`);

  return lines.join('\n');
}

function renderUnitLine(u: Unit): string {
  const ds = fmtDeathSaves(u);
  const dsText = ds ? ` ${ds}` : '';
  const resourcesText = fmtResources(u);
  const tagsText = fmtTags(u);
  const disabledPrefix = u.turnDisabled
    ? `${DISABLED_COLOR}[\uD134 \uBE44\uD65C\uC131\uD654]${RESET} `
    : '';

  if (!u.hp && getComputedAc(u) === undefined) {
    const text = formatUnitLabel(u, u.note ?? u.name);
    return `${disabledPrefix}${unitColor(u)}${text}${RESET}${resourcesText}${dsText}${tagsText}`;
  }

  const hp = fmtHp(u);
  const ac = fmtAc(u);
  const displayName = formatUnitLabel(u, u.name);
  let left = `${disabledPrefix}${unitColor(u)}${displayName} ${GRAY}- ${hp} / ${AC_COLOR}${ac}${RESET}`;
  return left + resourcesText + dsText + tagsText;
}

function renderTurnLine(state: EncounterState): string {
  if (!state.battleStarted) {
    const parts = state.turnOrder
      .map((t) => {
        if (t.kind === 'label') return t.text;
        if (t.kind === 'marker') {
          const m = state.markers?.find((x) => x.id === t.markerId);
          const duration = Number(m?.duration ?? 0);
          const hasDuration = m
            ? Number.isFinite(duration) && duration > 0
            : true;
          if (!hasDuration) return '';
          const label = m?.alias?.trim?.() || m?.name || t.markerId;
          return `${DISABLED_COLOR}[${label}]${color(38)}`;
        }
        if (t.kind === 'group') {
          if (!groupHasMembers(state, t.groupId)) return '';
          return groupLabel(state, t.groupId);
        }
        const u = state.units.find((x) => x.id === t.unitId);
        if (!u) return '';
        if ((u as any)?.bench) return '';
        if (normalizeUnitType(u) !== 'NORMAL') return '';
        const label = formatUnitLabel(
          u,
          u?.alias?.trim?.() || u?.name || t.unitId,
        );
        if (u?.turnDisabled) return `${DISABLED_COLOR}${label}${color(38)}`;
        return label;
      })
      .filter(Boolean);
    return parts.join(' - ');
  }

  const tempId = state.tempTurnStack?.length
    ? state.tempTurnStack[state.tempTurnStack.length - 1]
    : null;

  // ????? ????????????????????????????, ????????turnIndex ?????
  let activeIndex = state.turnIndex;

  if (tempId) {
    const idx = state.turnOrder.findIndex(
      (t) => t.kind === 'unit' && t.unitId === tempId,
    );
    if (idx >= 0) activeIndex = idx;
  }

  const parts = state.turnOrder
    .map((t, i) => {
      const isActive = i === activeIndex;
      const highlight = (text: string) => `${color(36)}${text}${color(38)}`;

      if (t.kind === 'label') return t.text;
      if (t.kind === 'marker') {
        const m = state.markers?.find((x) => x.id === t.markerId);
        const duration = Number(m?.duration ?? 0);
        const hasDuration = m ? Number.isFinite(duration) && duration > 0 : true;
        if (!hasDuration) return '';
        const label = m?.alias?.trim?.() || m?.name || t.markerId;
        return `${DISABLED_COLOR}[${label}]${color(38)}`;
      }
      if (t.kind === 'group') {
        if (!groupHasMembers(state, t.groupId)) return '';
        const label = groupLabel(state, t.groupId);
        return isActive ? highlight(label) : label;
      }
      const u = state.units.find((x) => x.id === t.unitId);
      if (!u) return '';
      if ((u as any)?.bench) return '';
      if (normalizeUnitType(u) !== 'NORMAL') return '';
      const label = formatUnitLabel(
        u,
        u?.alias?.trim?.() || u?.name || t.unitId,
      );
      if (u?.turnDisabled) return `${DISABLED_COLOR}${label}${color(38)}`;
      return isActive ? highlight(label) : label;
    })
    .filter(Boolean);

  return parts.join(' - ');
}

