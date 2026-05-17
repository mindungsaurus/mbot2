// encounter.render.ts
import { EncounterState, EncounterTurnSummary, Unit } from './encounter.types';
import {
  getAcBreakdown,
  getComputedAc,
  getComputedIntegrity,
  getDisplayTags,
} from './encounter.compute';
import { buildDistanceMarkLines, buildFormationLines } from './encounter.formation';

const RESET = '\x1b[0m';
const GRAY = '\x1b[0;37m';
const GROUP_MEMBERS_GRAY = '\x1b[0;30m';
const AC_COLOR = '\x1b[0;38m';

function color(code: number) {
  return `\x1b[1;${code}m`;
}

function colorPlain(code: number) {
  return `\x1b[0;${code}m`;
}

const DEATH_SUCCESS_COLOR = color(36); // cyan
const DEATH_FAILURE_COLOR = color(31); // red
const SLOT_COLOR = color(34); // blue
const CONSUMABLE_COLOR = color(33); // yellow
const TURN_PRIORITY_COLOR = colorPlain(33); // non-bold yellow
const DISABLED_COLOR = '\x1b[1;30m';

function colorNumber(value: number | string, tint: string) {
  return `${tint}${value}${RESET}`;
}

type RenderOptions = {
  hideBench?: boolean;
  hideBenchTeam?: boolean;
  hideBenchEnemy?: boolean;
  planarMode?: boolean;
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

function splitIdentifierLabel(label: string): { base: string; suffix: string | null } {
  const raw = (label ?? '').trim();
  if (!raw) return { base: raw, suffix: null };
  const bracket = raw.match(/\[([^\]]+)\]$/u);
  if (bracket?.[1]) {
    return { base: raw.slice(0, -bracket[0].length), suffix: bracket[1] };
  }
  const tail = raw.match(/([ㄱ-ㅎA-Za-z0-9α-ωΑ-Ω])$/u);
  if (tail?.[1] && raw.length > tail[1].length) {
    return { base: raw.slice(0, -tail[1].length), suffix: tail[1] };
  }
  return { base: raw, suffix: null };
}

function collapseIdentifierLabels(labels: string[]): string[] {
  const grouped: Array<{ base: string; label: string; suffixes: string[] | null }> = [];
  const baseIndex = new Map<string, number>();
  for (const label of labels) {
    const { base, suffix } = splitIdentifierLabel(label);
    if (suffix && base) {
      const idx = baseIndex.get(base);
      if (idx !== undefined) {
        grouped[idx].suffixes?.push(suffix);
      } else {
        grouped.push({ base, label, suffixes: [suffix] });
        baseIndex.set(base, grouped.length - 1);
      }
      continue;
    }
    grouped.push({ base: label, label, suffixes: null });
  }
  return grouped.map((g) => (g.suffixes ? `${g.base}${g.suffixes.join('')}` : g.label));
}

function groupMembersSummary(state: EncounterState, groupId: string): string {
  const g = Array.isArray(state.turnGroups)
    ? state.turnGroups.find((x) => x.id === groupId)
    : null;
  if (!g || !Array.isArray(g.unitIds) || g.unitIds.length === 0) return '';
  const labels: string[] = [];
  for (const id of g.unitIds) {
    const u = state.units.find((x) => x.id === id);
    if (!u) continue;
    if ((u as any)?.bench) continue;
    if (normalizeUnitType(u) !== 'NORMAL') continue;
    if (u.turnDisabled) continue;
    const label = formatUnitLabel(u, u?.name?.trim?.() || id);
    if (!label) continue;
    labels.push(label);
  }
  if (!labels.length) return '';
  return collapseIdentifierLabels(labels).join(', ');
}

function getTurnPriority(state: EncounterState, key: string): number | null {
  const map = (state as any).turnPriorities as Record<string, number> | undefined;
  if (!map || typeof map !== 'object') return null;
  const n = Math.floor(Number((map as any)[key]));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function withTurnPriority(state: EncounterState, key: string, text: string): string {
  const n = getTurnPriority(state, key);
  if (n == null) return text;
  return `${text} ${TURN_PRIORITY_COLOR}(${n})${color(38)}`;
}

function fmtTags(u: Unit, tagColors?: Record<string, number>) {
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

  const resolveColor = (tag: string) => {
    if (!tagColors) return undefined;
    const trimmed = tag.trim();
    if (trimmed && tagColors[trimmed] !== undefined) {
      return tagColors[trimmed];
    }
    const baseName = trimmed.replace(/\s+x\d+$/i, '').trim();
    if (baseName && tagColors[baseName] !== undefined) {
      return tagColors[baseName];
    }
    return undefined;
  };

  return (
    ' ' +
    all
      .map((t) => {
        const code = resolveColor(t);
        if (typeof code === 'number') {
          return `(${colorPlain(code)}${t}${RESET})`;
        }
        return `(${t})`;
      })
      .join(' ')
  );
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
  const failure = Math.max(-1, Math.floor(u.deathSaves?.failure ?? -1));
  if (success === 0 && failure === -1) return '';
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

function tintDistanceIndex(line: string): string {
  return line.replace(/(?:\[\d+\])+:/g, (m) => `${GROUP_MEMBERS_GRAY}${m}${RESET}${color(39)}`);
}

export function renderAnsi(
  state: EncounterState,
  opts?: RenderOptions,
  tagColors?: Record<string, number>,
): string {
  const hideBench = !!opts?.hideBench;
  const hideBenchTeam = hideBench || !!opts?.hideBenchTeam;
  const hideBenchEnemy = hideBench || !!opts?.hideBenchEnemy;
  const planarMode = !!opts?.planarMode;
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
  for (const u of team) lines.push(renderUnitLine(u, tagColors));
  if (benchTeam.length) {
    lines.push(`${DISABLED_COLOR}===============${RESET}`);
    for (const u of benchTeam) lines.push(renderUnitLine(u, tagColors));
  }
  lines.push('');

  lines.push(`${color(31)}Enemy${RESET}`);
  if (enemyNote) lines.push(enemyNote);
  for (const u of enemy) lines.push(renderUnitLine(u, tagColors));
  if (benchEnemy.length) {
    lines.push(`${DISABLED_COLOR}===============${RESET}`);
    for (const u of benchEnemy) lines.push(renderUnitLine(u, tagColors));
  }
  lines.push('');

  if (neutral.length) {
    lines.push(`${color(90)}Neutral${RESET}`);
    if (neutralNote) lines.push(neutralNote);
    for (const u of neutral) lines.push(renderUnitLine(u, tagColors));
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

  if (!planarMode) {
    lines.push(`${color(39)}Formation${RESET}`);
    const formation = buildFormationLines(state, {
      formatUnitLabel: (u, label) => `${unitColor(u)}${label}${color(39)}`,
    });

    if (formation.length === 0) lines.push(`${color(39)}-${RESET}`);
    else for (const f of formation) lines.push(`${color(39)}${f}${RESET}`);

    lines.push('');
  }

  lines.push(`${color(36)}Distance Marks${RESET}`);
  const distanceMarks = buildDistanceMarkLines(state, {
    formatUnitLabel: (u, label) => `${unitColor(u)}${label}${color(39)}`,
    planarMode,
  });
  if (distanceMarks.length === 0) lines.push(`${color(39)}-${RESET}`);
  else for (const d of distanceMarks) lines.push(`${color(39)}${tintDistanceIndex(d)}${RESET}`);

  return lines.join('\n');
}

export function renderTurnSummaryAnsi(
  state: EncounterState,
  tagColors?: Record<string, number>,
): string {
  return renderTurnSummaryLines(state, tagColors).join('\n');
}

function selectTurnSummary(state: EncounterState): EncounterTurnSummary | null {
  const current = state.currentTurnSummary;
  if (current?.hasChanges) return current;
  const latest = state.latestTurnSummary;
  if (latest?.hasChanges) return latest;
  return current ?? latest ?? null;
}

function renderTurnSummaryLines(
  state: EncounterState,
  tagColors?: Record<string, number>,
): string[] {
  const summary = selectTurnSummary(state);
  if (!summary) return [];

  const heading = summary.isTemp
    ? `Turn Summary - Temp: ${summary.subjectLabel}`
    : `Turn Summary - ${summary.subjectLabel}`;
  const lines = [`${color(35)}${heading}${RESET}`];

  if (!summary.hasChanges) {
    lines.push(`${GRAY}- no changes${RESET}`);
    return lines;
  }

  const removedUnits = (summary.units ?? []).filter(
    (unit) => unit.status === 'removed',
  );

  for (const unit of summary.units ?? []) {
    if (unit.status === 'removed') continue;
    const renderedChanges = (unit.changes ?? [])
      .flatMap((change) => {
        const rendered = renderSummaryChange(change, tagColors);
        return Array.isArray(rendered) ? rendered : rendered ? [rendered] : [];
      });
    if (renderedChanges.length === 0) continue;

    const label = unit.alias ? `${unit.name} (${unit.alias})` : unit.name;
    lines.push(
      `${unitSummaryColor(unit.side, summaryUnitColorCode(state, unit))}${label}${RESET}`,
    );
    for (const rendered of renderedChanges) {
      lines.push(`${GRAY}- ${rendered}${RESET}`);
    }
  }

  const renderedMarkers = (summary.markers ?? [])
    .map((marker) => ({
      marker,
      changes: (marker.changes ?? [])
        .map((change) => renderMarkerSummaryChange(marker, change))
        .filter((line): line is string => !!line),
    }))
    .filter((entry) => entry.changes.length > 0);

  if (renderedMarkers.length) {
    lines.push(`${color(36)}Markers${RESET}`);
    for (const { marker, changes } of renderedMarkers) {
      const label = marker.alias ? `${marker.name} (${marker.alias})` : marker.name;
      lines.push(`${GRAY}${label}${RESET}`);
      for (const rendered of changes) {
        lines.push(`${GRAY}- ${rendered}${RESET}`);
      }
    }
  }

  if (removedUnits.length) {
    const deleted = removedUnits
      .map((unit) => {
        const label = unit.alias ? `${unit.name} (${unit.alias})` : unit.name;
        return `${unitSummaryColor(unit.side, summaryUnitColorCode(state, unit))}${label}${RESET}${GRAY}`;
      })
      .join(', ');
    lines.push(`${DISABLED_COLOR}삭제된 유닛:${RESET}`);
    lines.push(`${deleted}${RESET}`);
  }

  return lines;
}

function summaryUnitColorCode(
  state: EncounterState,
  unit: EncounterTurnSummary['units'][number],
) {
  if (typeof unit.colorCode === 'number') return unit.colorCode;
  const live = state.units.find((candidate) => candidate.id === unit.unitId);
  return typeof live?.colorCode === 'number' ? live.colorCode : undefined;
}

function renderSummaryChange(
  change: EncounterTurnSummary['units'][number]['changes'][number],
  tagColors?: Record<string, number>,
): string | string[] | null {
  if (change.kind === 'hp') return renderHpSummaryChange(change);
  if (change.kind === 'deathSaves') return renderDeathSaveSummaryChange(change);
  if (change.kind === 'spellSlots') return renderSpellSlotSummaryChange(change);
  if (change.kind === 'consumables') return renderConsumableSummaryChange(change);
  if (change.kind === 'toggleTags') return renderToggleTagSummaryChange(change, tagColors);
  if (change.kind === 'stackTags') return renderStackTagSummaryChange(change, tagColors);
  return `${change.label}: ${change.before ?? '-'} → ${change.after ?? '-'}`;
}

function renderHpSummaryChange(
  change: EncounterTurnSummary['units'][number]['changes'][number],
): string | string[] {
  const before = parseHpSummary(change.before);
  const after = parseHpSummary(change.after);
  if (!after) return `체력: ${change.before ?? '-'} → ${change.after ?? '-'}`;

  const rawCurDelta = before ? after.cur - before.cur : after.cur;
  const maxDelta = before ? after.max - before.max : after.max;
  const tempDelta = before ? after.temp - before.temp : after.temp;
  const curDelta =
    before && before.cur === before.max && maxDelta !== 0
      ? rawCurDelta - maxDelta
      : rawCurDelta;

  const lines: string[] = [];
  if (curDelta !== 0 || tempDelta !== 0) {
    lines.push(`${hpChangeLabel(curDelta, tempDelta)}: ${formatHpWithDelta(after, curDelta, tempDelta)}`);
  }
  if (maxDelta !== 0) {
    lines.push(`${maxHpChangeLabel(maxDelta)}: ${after.max} ${formatSignedDeltaParen(maxDelta)}`);
  }
  return lines.length ? lines : `체력: ${formatHpBase(after)}`;
}

function hpChangeLabel(curDelta: number, tempDelta: number) {
  if (curDelta < 0) return '체력 감소';
  if (curDelta > 0) return '체력 증가';
  if (tempDelta !== 0) return '임시 체력';
  return '체력';
}

function maxHpChangeLabel(maxDelta: number) {
  return maxDelta < 0 ? '최대 체력 감소' : '최대 체력 증가';
}

function renderDeathSaveSummaryChange(
  change: EncounterTurnSummary['units'][number]['changes'][number],
): string {
  const before = parseDeathSaveSummary(change.before);
  const after = parseDeathSaveSummary(change.after);
  if (!after) return `사망내성: ${change.before ?? '-'} → ${change.after ?? '-'}`;
  const successDelta = before ? after.success - before.success : after.success;
  const failureDelta = before ? after.failure - before.failure : after.failure;
  const label = before ? '사망내성' : '사망 내성 표기 시작';
  return `${label}: (${formatDeathPart(after.success, successDelta, color(32))}, ${formatDeathPart(after.failure, failureDelta, color(31))})`;
}

function renderSpellSlotSummaryChange(
  change: EncounterTurnSummary['units'][number]['changes'][number],
): string {
  const before = parseNumberRecordSummary(change.before);
  const after = parseNumberRecordSummary(change.after);
  const levels = numericKeys(before, after);
  if (levels.length === 0) return '주문슬롯: [ ]';
  const cells = levels.map((level) => {
    const key = String(level);
    const value = after[key] ?? 0;
    const delta = value - (before[key] ?? 0);
    return `${value}${formatSignedDeltaParen(delta)}`;
  });
  return `주문슬롯: [${cells.join(' / ')}]`;
}

function renderConsumableSummaryChange(
  change: EncounterTurnSummary['units'][number]['changes'][number],
): string {
  const before = parseNumberRecordSummary(change.before);
  const after = parseNumberRecordSummary(change.after);
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort(
    (a, b) => a.localeCompare(b, undefined, { numeric: true }),
  );
  const parts = keys
    .filter((key) => (before[key] ?? 0) !== (after[key] ?? 0))
    .map((key) => {
      const value = after[key] ?? 0;
      const delta = value - (before[key] ?? 0);
      return `${key} x${value}${formatSignedDeltaParen(delta)}`;
    });
  return `고유소모값: ${parts.length ? parts.join(', ') : '변경 없음'}`;
}

function renderToggleTagSummaryChange(
  change: EncounterTurnSummary['units'][number]['changes'][number],
  tagColors?: Record<string, number>,
): string | null {
  const before = new Set(parseListSummary(change.before));
  const after = new Set(parseListSummary(change.after));
  const gained = [...after].filter((tag) => !before.has(tag)).sort((a, b) => a.localeCompare(b));
  const lost = [...before].filter((tag) => !after.has(tag)).sort((a, b) => a.localeCompare(b));
  const parts = [
    ...gained.map((tag) => `${colorTag(tag, tagColors)} 획득`),
    ...lost.map((tag) => `${colorTag(tag, tagColors)} 잃음`),
  ];
  return parts.length ? `태그: ${parts.join(', ')}` : null;
}

function renderStackTagSummaryChange(
  change: EncounterTurnSummary['units'][number]['changes'][number],
  tagColors?: Record<string, number>,
): string | null {
  const before = parseStackTagSummary(change.before);
  const after = parseStackTagSummary(change.after);
  const names = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort((a, b) =>
    a.localeCompare(b),
  );
  const parts = names
    .filter((name) => (before[name] ?? 0) !== (after[name] ?? 0))
    .map((name) => {
      const value = after[name] ?? 0;
      const delta = value - (before[name] ?? 0);
      const prefix = value > 0 ? `${colorTag(name, tagColors)} x${value}` : `${colorTag(name, tagColors)} 0`;
      return `${prefix}${formatSignedDeltaParen(delta)}`;
    });
  return parts.length ? `스택 태그: ${parts.join(', ')}` : null;
}

function renderMarkerSummaryChange(
  marker: EncounterTurnSummary['markers'][number],
  change: EncounterTurnSummary['markers'][number]['changes'][number],
): string | null {
  const label = marker.alias ? `${marker.name} (${marker.alias})` : marker.name;
  if (change.kind === 'created') {
    return `마커 생성됨: ${label}${formatMarkerDurationFromText(change.after)}`;
  }
  if (change.kind === 'removed') {
    return `마커 제거됨: ${label}${formatMarkerDurationFromText(change.before)}`;
  }
  if (change.label === '위치' || change.label === '범위') return null;
  if (change.label === '지속시간') {
    return `마커 지속시간: ${label} ${formatHourglass(change.before)} → ${formatHourglass(change.after)}`;
  }
  return `${change.label}: ${change.before ?? '-'} → ${change.after ?? '-'}`;
}

function parseHpSummary(value?: string): { cur: number; max: number; temp: number } | null {
  const text = String(value ?? '');
  const match = text.match(/(\d+)\/(\d+)(?:\s*\(\+(\d+)\))?/);
  if (!match) return null;
  return {
    cur: Number(match[1]),
    max: Number(match[2]),
    temp: Number(match[3] ?? 0),
  };
}

function formatHpWithDelta(
  hp: { cur: number; max: number; temp: number },
  curDelta: number,
  tempDelta: number,
) {
  const base = formatHpBase(hp);
  const parts: string[] = [];
  if (curDelta !== 0) {
    parts.push(formatSignedDelta(curDelta));
  }
  if (tempDelta !== 0) {
    parts.push(formatSignedDelta(tempDelta, color(34)));
  }
  return parts.length ? `${base} (${parts.join('/')})` : base;
}

function formatHpBase(hp: { cur: number; max: number; temp: number }) {
  return `${hp.cur}/${hp.max}${hp.temp > 0 ? colorNumber(`+${hp.temp}`, color(34)) : ''}`;
}

function parseDeathSaveSummary(value?: string): { success: number; failure: number } | null {
  const text = String(value ?? '');
  const match = text.match(/(-?\d+)S\/(-?\d+)F/);
  if (!match) return null;
  return { success: Number(match[1]), failure: Number(match[2]) };
}

function formatDeathPart(value: number, delta: number, tint: string) {
  const suffix = delta === 0 ? '' : ` (${formatSignedDelta(delta, tint)})`;
  return `${colorNumber(value, tint)}${suffix}`;
}

function parseNumberRecordSummary(value?: string): Record<string, number> {
  const text = String(value ?? '').trim();
  if (!text || text === '없음' || text.includes('?놁쓬')) return {};
  const out: Record<string, number> = {};
  for (const part of text.split(',')) {
    const [rawKey, rawValue] = part.split(':');
    const key = rawKey?.trim();
    const value = Number(rawValue?.trim());
    if (key && Number.isFinite(value)) out[key] = value;
  }
  return out;
}

function numericKeys(...records: Array<Record<string, number>>) {
  return [...new Set(records.flatMap((record) => Object.keys(record).map((key) => Number(key))))]
    .filter((level) => Number.isFinite(level) && level >= 1)
    .sort((a, b) => a - b);
}

function parseListSummary(value?: string): string[] {
  const text = String(value ?? '').trim();
  if (!text || text === '없음' || text.includes('?놁쓬')) return [];
  return text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseStackTagSummary(value?: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of parseListSummary(value)) {
    const match = part.match(/^(.+?)\s+x(\d+)/);
    if (!match) continue;
    out[match[1].trim()] = Number(match[2]);
  }
  return out;
}

function formatSignedDelta(delta: number, tint?: string) {
  if (delta === 0) return '';
  const sign = delta > 0 ? '+' : '';
  const colorCode = tint ?? (delta > 0 ? color(32) : color(31));
  return colorNumber(`${sign}${delta}`, colorCode);
}

function formatSignedDeltaParen(delta: number, tint?: string) {
  if (delta === 0) return '';
  return `(${formatSignedDelta(delta, tint)})`;
}

function colorTag(tag: string, tagColors?: Record<string, number>) {
  const code = tagColors?.[tag];
  return typeof code === 'number' ? `${color(code)}${tag}${RESET}${GRAY}` : tag;
}

function formatMarkerDurationFromText(value?: string) {
  const match = String(value ?? '').match(/duration\s+(\d+)/);
  return match ? ` ${formatHourglass(match[1])}` : '';
}

function formatHourglass(value?: string) {
  const raw = String(value ?? '').trim();
  if (!raw || raw === '없음' || raw.includes('?놁쓬')) return '⏳-';
  return `⏳${raw}`;
}

function unitSummaryColor(side?: string, colorCode?: number) {
  if (typeof colorCode === 'number') return color(colorCode);
  if (side === 'TEAM') return color(34);
  if (side === 'ENEMY') return color(31);
  return color(90);
}

function renderUnitLine(
  u: Unit,
  tagColors?: Record<string, number>,
): string {
  const ds = fmtDeathSaves(u);
  const dsText = ds ? ` ${ds}` : '';
  const resourcesText = fmtResources(u);
  const tagsText = fmtTags(u, tagColors);
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
          const key = `group:${t.groupId}`;
          const base = groupLabel(state, t.groupId);
          return withTurnPriority(state, key, base);
        }
        const u = state.units.find((x) => x.id === t.unitId);
        if (!u) return '';
        if ((u as any)?.bench) return '';
        if (normalizeUnitType(u) !== 'NORMAL') return '';
        const label = formatUnitLabel(
          u,
          u?.alias?.trim?.() || u?.name || t.unitId,
        );
        const key = `unit:${u.id}`;
        if (u?.turnDisabled)
          return withTurnPriority(state, key, `${DISABLED_COLOR}${label}${color(38)}`);
        return withTurnPriority(state, key, label);
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
        const key = `group:${t.groupId}`;
        const base = isActive
          ? highlight(groupLabel(state, t.groupId))
          : groupLabel(state, t.groupId);
        return withTurnPriority(state, key, base);
      }
      const u = state.units.find((x) => x.id === t.unitId);
      if (!u) return '';
      if ((u as any)?.bench) return '';
      if (normalizeUnitType(u) !== 'NORMAL') return '';
      const label = formatUnitLabel(
          u,
          u?.alias?.trim?.() || u?.name || t.unitId,
        );
      const key = `unit:${u.id}`;
      if (u?.turnDisabled)
        return withTurnPriority(state, key, `${DISABLED_COLOR}${label}${color(38)}`);
      return withTurnPriority(state, key, isActive ? highlight(label) : label);
    })
    .filter(Boolean);

  return parts.join(' - ');
}

