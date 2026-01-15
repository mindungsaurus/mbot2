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
  return color(90); // NEUTRAL
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
    parts.push(String(n));
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
      return `[${name} ${n}]`;
    })
    .join(' ');
}

function fmtResources(u: Unit): string {
  const slots = fmtSpellSlots(u);
  const cons = fmtConsumables(u);
  if (!slots && !cons) return '';
  return ' ' + [slots, cons].filter(Boolean).join(' ');
}

function fmtDeathSaves(u: Unit): string {
  const success = Math.max(0, Math.floor(u.deathSaves?.success ?? 0));
  const failure = Math.max(0, Math.floor(u.deathSaves?.failure ?? 0));
  if (success === 0 && failure === 0) return '';
  return `(${success}, ${failure})`;
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

  if (neutral.length) {
    lines.push(`${color(90)}Neutral${RESET}`);
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

  if (!u.hp && getComputedAc(u) === undefined) {
    const text = u.note ?? u.name;
    return `${unitColor(u)}${text}${RESET}${dsText}${fmtResources(u)}${fmtTags(u)}`;
  }

  const hp = fmtHp(u);
  const ac = fmtAc(u);
  let left = `${unitColor(u)}${u.name} ${GRAY}- ${hp} / ${AC_COLOR}${ac}${RESET}`;
  if (ds) left += `${GRAY} ${ds}${RESET}`;
  return left + fmtResources(u) + fmtTags(u);
}

function renderTurnLine(state: EncounterState): string {
  const tempId = state.tempTurnStack?.length
    ? state.tempTurnStack[state.tempTurnStack.length - 1]
    : null;

  // 임시 턴이면 그 유닛을 기준으로, 없으면 turnIndex 기준
  let activeIndex = state.turnIndex;

  if (tempId) {
    const idx = state.turnOrder.findIndex(
      (t) => t.kind === 'unit' && t.unitId === tempId,
    );
    if (idx >= 0) activeIndex = idx;
  }

  const parts = state.turnOrder.map((t, i) => {
    const isActive = i === activeIndex;
    const highlight = (text: string) => `${color(36)}${text}${color(38)}`;

    if (t.kind === 'label') return t.text;
    if (t.kind === 'marker') {
      const m = state.markers?.find((x) => x.id === t.markerId);
      const label = m?.alias?.trim?.() || m?.name || t.markerId;
      return `${label}`;
    }
    const u = state.units.find((x) => x.id === t.unitId);
    const label = u?.alias?.trim?.() || u?.name || t.unitId;
    const name = `${label}`;
    return isActive ? highlight(name) : name;
  });

  if (tempId) {
    return parts.join(' - ');
  }

  return parts.join(' - ');
}
