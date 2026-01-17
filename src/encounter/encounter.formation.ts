//encounter.formation.ts
import { EncounterState, Marker, Unit } from './encounter.types';

const CELL_M = 3;

type Node = {
  x: number;
  label: string;
};

export function buildFormationLines(
  state: EncounterState,
  opts?: {
    formatUnitLabel?: (unit: Unit, baseLabel: string) => string;
    formatMarkerLabel?: (marker: Marker, baseLabel: string) => string;
    formatFloorLabel?: (z: number) => string;
  },
): string[] {
  const byZ = new Map<number, Map<number, { markers: string[]; units: string[] }>>();

  function getCell(z: number, x: number) {
    const row = byZ.get(z) ?? new Map<number, { markers: string[]; units: string[] }>();
    if (!byZ.has(z)) byZ.set(z, row);
    const cell = row.get(x) ?? { markers: [], units: [] };
    if (!row.has(x)) row.set(x, cell);
    return cell;
  }

  // 유닛 수집
  for (const u of state.units ?? []) {
    if (u.hidden) continue;
    if ((u as any).bench) continue;
    if (!u.pos) continue;
    const baseLabel = (u.alias ?? '').trim() || u.name;
    const label = opts?.formatUnitLabel
      ? opts.formatUnitLabel(u, baseLabel)
      : baseLabel;
    getCell(u.pos.z, u.pos.x).units.push(label);
  }

  // 마커 수집
  for (const m of state.markers ?? []) {
    const baseLabel = (m as any).alias?.trim?.() || m.name;
    const markerLabel = opts?.formatMarkerLabel
      ? opts.formatMarkerLabel(m, baseLabel)
      : baseLabel;
    // Markers can cover multiple cells; include each cell in the formation map.
    const cells =
      Array.isArray((m as any).cells) && (m as any).cells.length
        ? (m as any).cells
        : m.pos
          ? [m.pos]
          : [];

    for (const cell of cells) {
      if (!cell) continue;
      getCell(cell.z, cell.x).markers.push(markerLabel);
    }
  }

  // z 오름차순으로 라인 생성
  const zs = Array.from(byZ.keys()).sort((a, b) => a - b);
  const lines: string[] = [];

  for (const z of zs) {
    const row = byZ.get(z)!;
    const nodes: Node[] = [];

    for (const [x, cell] of row.entries()) {
      const markers = cell.markers.filter(Boolean);
      const units = cell.units.filter(Boolean);
      // Markers first (bracketed), then units.
      let label = '';
      if (markers.length) {
        const markerText = markers.join(',');
        label = units.length ? `${markerText}${units.join(',')}` : markerText;
      } else {
        label = units.join(',');
      }
      nodes.push({ x, label });
    }

    // x 오름차순 정렬
    nodes.sort((a, b) => a.x - b.x);

    const line = buildLineFromNodes(nodes);
    const floorLabel = opts?.formatFloorLabel
      ? opts.formatFloorLabel(z)
      : formatFloorLabel(z);
    lines.push(`(${floorLabel}): ${line}`);
  }

  return lines;
}

function formatFloorLabel(z: number): string {
  if (z >= 0) return `${z + 1}F`;
  return `B${Math.abs(z)}`;
}

function buildLineFromNodes(nodes: Node[]): string {
  if (nodes.length === 0) return '-';
  if (nodes.length === 1) return nodes[0].label;

  let out = nodes[0].label;

  for (let i = 1; i < nodes.length; i++) {
    const prev = nodes[i - 1];
    const cur = nodes[i];

    const dxCells = Math.abs(cur.x - prev.x); // x는 "칸" 단위라고 가정
    const distM = dxCells * CELL_M;

    // 안전장치: 너무 길어지는 걸 방지 (원하면 숫자 조절)
    const MAX_DASH = 30;
    const dashCount = Math.max(1, Math.min(MAX_DASH, dxCells));
    const dashes = '-'.repeat(dashCount);

    out += `${dashes}${distM}${dashes}${cur.label}`;
  }

  return out;
}
