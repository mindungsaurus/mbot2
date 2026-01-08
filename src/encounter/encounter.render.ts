//encounter/encounter.render.ts
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
  return u.side === 'TEAM' ? color(34) : color(31);
}

function fmtTags(u: Unit) {
  const tags = getDisplayTags(u);
  if (!tags.length) return '';
  return ' ' + tags.map((t) => `(${t})`).join(' ');
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

  const ds = delta > 0 ? `+${delta}` : `${delta}`; // (+2) / (-3)
  return `AC.${base}(${ds})`;
}

export function renderAnsi(state: EncounterState): string {
  const team = state.units.filter((u) => u.side === 'TEAM');
  const enemy = state.units.filter((u) => u.side === 'ENEMY');

  const lines: string[] = [];

  lines.push(`${color(34)}Team${RESET}`);
  for (const u of team) lines.push(renderUnitLine(u));
  lines.push('');

  lines.push(`${color(31)}Enemy${RESET}`);
  for (const u of enemy) lines.push(renderUnitLine(u));
  lines.push('');

  lines.push(`${color(33)}Turn${RESET}`);
  lines.push(`${color(38)}${renderTurnLine(state)}${RESET}`);
  lines.push('');

  lines.push(`${color(39)}Formation${RESET}`);
  const formation = buildFormationLines(state); // 이것만 사용

  if (formation.length === 0) {
    lines.push(`${color(39)}-${RESET}`); // 아무것도 없으면 placeholder
  } else {
    for (const f of formation) lines.push(`${color(39)}${f}${RESET}`);
  }

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
  const parts = state.turnOrder.map((t, i) => {
    const curMark = i === state.turnIndex ? ' *' : '';
    if (t.kind === 'label') return `${t.text}${curMark}`;
    const u = state.units.find((x) => x.id === t.unitId);
    return `${u?.name ?? t.unitId}${curMark}`;
  });
  return parts.join(' - ');
}
