//encounter.formation.ts
import { EncounterState } from './encounter.types';

const CELL_M = 3;

type Node = {
  x: number;
  label: string;
};

export function buildFormationLines(state: EncounterState): string[] {
  const byZ = new Map<number, Node[]>();

  // 유닛 수집
  for (const u of state.units ?? []) {
    if (!u.pos) continue;
    const z = u.pos.z;
    const arr = byZ.get(z) ?? [];
    arr.push({ x: u.pos.x, label: u.alias ?? u.name });
    byZ.set(z, arr);
  }

  // 마커 수집
  for (const m of state.markers ?? []) {
    const z = m.pos.z;
    const arr = byZ.get(z) ?? [];
    arr.push({ x: m.pos.x, label: m.name });
    byZ.set(z, arr);
  }

  // z 오름차순으로 라인 생성
  const zs = Array.from(byZ.keys()).sort((a, b) => a - b);
  const lines: string[] = [];

  for (const z of zs) {
    const nodes = byZ.get(z)!;

    // 같은 (x,z)에 여러 개 있으면 한 덩어리로 합치기: "A,B"
    const merged = mergeSameX(nodes);

    // x 오름차순 정렬
    merged.sort((a, b) => a.x - b.x);

    const line = buildLineFromNodes(merged);
    // 층 표시를 넣고 싶으면 아래처럼(원치 않으면 그냥 line만 push)
    lines.push(`(z=${z}): ${line}`);
  }

  return lines;
}

function mergeSameX(nodes: Node[]): Node[] {
  const map = new Map<number, string[]>();
  for (const n of nodes) {
    const arr = map.get(n.x) ?? [];
    arr.push(n.label);
    map.set(n.x, arr);
  }
  return Array.from(map.entries()).map(([x, labels]) => ({
    x,
    label: labels.join(','),
  }));
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
