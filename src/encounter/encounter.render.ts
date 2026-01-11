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

function unitColor(u: Unit) {
  if (typeof u.colorCode === 'number') return color(u.colorCode);
  if (u.side === 'TEAM') return color(34);
  if (u.side === 'ENEMY') return color(31);
  return color(37); // NEUTRAL
}

function extraTurnTags(u: Unit): string[] {
  if (!u.tagStates) return [];
  const out: string[] = [];
  for (const [k, st] of Object.entries(u.tagStates)) {
    const tag = (k ?? '').trim();
    if (!tag) continue;
    const n = Math.max(0, Math.floor(st?.stacks ?? 0));
    if (n <= 0) continue;
    out.push(n === 1 ? tag : `${tag} x${n}`);
  }
  return out;
}

function fmtTags(u: Unit) {
  const base = getDisplayTags(u);
  const extra = extraTurnTags(u);

  const seen = new Set<string>();
  const all: string[] = [];
  for (const t of [...base, ...extra]) {
    const s = (t ?? '').trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    all.push(s);
  }

  if (!all.length) return '';
  return ' ' + all.map((t) => `(${t})`).join(' ');
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

export function renderAnsi(state: EncounterState): string {
  const team = state.units.filter((u) => u.side === 'TEAM');
  const enemy = state.units.filter((u) => u.side === 'ENEMY');
  const neutral = state.units.filter((u) => u.side === 'NEUTRAL');

  const lines: string[] = [];

  lines.push(`${color(34)}Team${RESET}`);
  for (const u of team) lines.push(renderUnitLine(u));
  lines.push('');

  lines.push(`${color(31)}Enemy${RESET}`);
  for (const u of enemy) lines.push(renderUnitLine(u));
  lines.push('');

  lines.push(`${color(37)}Neutral${RESET}`);
  for (const u of neutral) lines.push(renderUnitLine(u));
  lines.push('');

  lines.push(`${color(33)}Turn${RESET}`);

  const round = Math.floor((state as any).round ?? 1);
  const safeRound = Number.isFinite(round) && round >= 1 ? round : 1;
  lines.push(`${color(38)}Round ${safeRound}${RESET}`);

  lines.push(`${color(38)}${renderTurnLine(state)}${RESET}`);
  lines.push('');

  lines.push(`${color(39)}Formation${RESET}`);
  const formation = buildFormationLines(state);

  if (formation.length === 0) lines.push(`${color(39)}-${RESET}`);
  else for (const f of formation) lines.push(`${color(39)}${f}${RESET}`);

  return lines.join('\n');
}

function renderUnitLine(u: Unit): string {
  if (!u.hp && getComputedAc(u) === undefined) {
    const text = u.note ?? u.name;
    return `${unitColor(u)}${text}${RESET}`;
  }

  const left = `${unitColor(u)}${u.name} ${GRAY}- ${fmtHp(u)} / ${AC_COLOR}${fmtAc(u)}${RESET}`;
  return left + fmtTags(u);
}

function renderTurnLine(state: EncounterState): string {
  const tempId = state.tempTurnStack?.length
    ? state.tempTurnStack[state.tempTurnStack.length - 1]
    : null;

  // 임시 턴이면 그 유닛을 *로 찍고, 없으면 turnIndex 기준
  let activeIndex = state.turnIndex;

  if (tempId) {
    const idx = state.turnOrder.findIndex(
      (t) => t.kind === 'unit' && t.unitId === tempId,
    );
    if (idx >= 0) activeIndex = idx;
  }

  const parts = state.turnOrder.map((t, i) => {
    const curMark = i === activeIndex ? ' *' : '';
    if (t.kind === 'label') return `${t.text}${curMark}`;
    const u = state.units.find((x) => x.id === t.unitId);
    return `${u?.name ?? t.unitId}${curMark}`;
  });

  if (tempId) {
    const u = state.units.find((x) => x.id === tempId);
    const name = u?.name ?? tempId;
    return `TEMP TURN: ${name} | ` + parts.join(' - ');
  }

  return parts.join(' - ');
}
