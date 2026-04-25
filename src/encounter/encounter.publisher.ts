import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { createCanvas, registerFont } from 'canvas';
import type { CanvasRenderingContext2D } from 'canvas';
import {
  AttachmentBuilder,
  ChannelType,
  Client,
  TextChannel,
} from 'discord.js';
import type { EncounterState, Marker, Unit } from './encounter.types';

type PublishRenderState = Pick<
  EncounterState,
  | 'units'
  | 'markers'
  | 'blockedCells'
  | 'gridLabels'
  | 'turnOrder'
  | 'turnIndex'
  | 'round'
  | 'battleStarted'
  | 'tempTurnStack'
  | 'turnGroups'
>;

const GRID_FONT_REGISTRATION_TARGETS: ReadonlyArray<{
  path: string;
  family: string;
}> = [
  {
    path: '/usr/share/fonts/truetype/nanum/NanumGothic.ttf',
    family: 'Nanum Gothic',
  },
  {
    path: '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
    family: 'Noto Sans CJK KR',
  },
  {
    path: '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
    family: 'Noto Sans CJK KR',
  },
  {
    path: '/usr/share/fonts/truetype/noto/NotoSansKR-Regular.otf',
    family: 'Noto Sans KR',
  },
  {
    path: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    family: 'DejaVu Sans',
  },
];

let canvasFontReady = false;

function ensureCanvasFontRuntimeReady() {
  if (canvasFontReady) return;

  if (!process.env.FONTCONFIG_PATH) process.env.FONTCONFIG_PATH = '/etc/fonts';
  if (!process.env.FONTCONFIG_FILE) {
    process.env.FONTCONFIG_FILE = '/etc/fonts/fonts.conf';
  }

  for (const target of GRID_FONT_REGISTRATION_TARGETS) {
    try {
      if (!existsSync(target.path)) continue;
      registerFont(target.path, { family: target.family });
    } catch {
      // fallback fonts will be used if registration fails
    }
  }

  canvasFontReady = true;
}

const GRID_FONT_FAMILY =
  '"Noto Sans CJK KR","Noto Sans KR","Noto Sans","Nanum Gothic","Malgun Gothic","맑은 고딕","DejaVu Sans","Arial Unicode MS","Noto Color Emoji",sans-serif';

const IDENTIFIER_SYMBOLS = [
  'ㄱ',
  'ㄴ',
  'ㄷ',
  'ㄹ',
  'ㅁ',
  'ㅂ',
  'ㅅ',
  'ㅇ',
  'ㅈ',
  'ㅊ',
  'ㅋ',
  'ㅌ',
  'ㅍ',
  'ㅎ',
  ...'abcdefghijklmnopqrstuvwxyz'.split(''),
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
  'α',
  'β',
  'γ',
  'δ',
  'ε',
  'ζ',
  'η',
  'θ',
  'ι',
  'κ',
  'λ',
  'μ',
  'ν',
  'ξ',
  'ο',
  'π',
  'ρ',
  'σ',
  'τ',
  'υ',
  'φ',
  'χ',
  'ψ',
  'ω',
  ...Array.from({ length: 20 }, (_, i) => String(i + 1)),
].sort((a, b) => b.length - a.length);

@Injectable()
export class EncounterPublisher {
  private readonly logger = new Logger(EncounterPublisher.name);

  constructor(
    @Optional() @Inject(Client) private readonly client?: Client,
  ) {}

  async sendAnsiToChannel(
    channelId: string,
    ansiText: string,
    state?: PublishRenderState,
  ) {
    if (!channelId) throw new Error('COMBAT_DISCORD_CHANNEL_ID is required');
    if (!this.client) {
      this.logger.warn(
        'Discord client unavailable; skipping encounter publish.',
      );
      return;
    }

    const channel = await this.client.channels.fetch(channelId);
    if (!channel) throw new Error(`channel not found: ${channelId}`);
    if (channel.type !== ChannelType.GuildText)
      throw new Error(`not a guild text channel: ${channelId}`);

    const text = channel as TextChannel;

    // Discord 2000자 제한 대응: 줄 기준으로 쪼개서 여러 메시지로 보내기
    for (const part of chunkByLines(ansiText, 1800)) {
      await text.send(wrapAnsi(part)); // ✅ 항상 "새 메시지"
    }

    if (state) {
      const attachment = renderBattleGridAttachment(state);
      if (attachment) {
        // 임베드 이미지가 아닌 첨부 파일 자체로 전송
        await text.send({ files: [attachment] });
      }
    }
  }
}

function wrapAnsi(s: string) {
  return `\`\`\`ansi\n${s}\n\`\`\``;
}

function chunkByLines(s: string, maxLen: number): string[] {
  if (s.length <= maxLen) return [s];

  const lines = s.split('\n');
  const out: string[] = [];
  let cur = '';

  for (const line of lines) {
    // Turn 섹션은 항상 새 메시지에서 시작하도록 강제 분할
    if (line.includes('Turn (Round')) {
      if (cur) out.push(cur);
      cur = line;
      continue;
    }

    const next = cur ? `${cur}\n${line}` : line;
    if (next.length > maxLen) {
      if (cur) out.push(cur);
      cur = line;
    } else {
      cur = next;
    }
  }
  if (cur) out.push(cur);
  return out;
}

function getUnitLabel(u: Unit): string {
  return (u.alias ?? '').trim() || (u.name ?? '').trim() || u.id;
}

function renderBattleGridAttachment(
  state: PublishRenderState,
): AttachmentBuilder | null {
  ensureCanvasFontRuntimeReady();

  const visibleUnits = (state.units ?? []).filter(
    (u) => !u.hidden && !(u as any).bench && !!u.pos,
  );
  const blockedCells = Array.isArray((state as any).blockedCells)
    ? ((state as any).blockedCells as Array<{ x: number; z: number }>)
    : [];
  const markerPoints = collectMarkerPoints(state.markers ?? []);
  if (!visibleUnits.length && !markerPoints.length && !blockedCells.length)
    return null;

  const points: Array<{ x: number; z: number }> = [];
  for (const u of visibleUnits) {
    points.push({ x: u.pos!.x, z: u.pos!.z });
  }
  for (const p of markerPoints) points.push({ x: p.x, z: p.z });
  for (const b of blockedCells) points.push({ x: b.x, z: b.z });

  const minX = Math.min(...points.map((p) => p.x));
  const maxX = Math.max(...points.map((p) => p.x));
  const minZ = Math.min(...points.map((p) => p.z));
  const maxZ = Math.max(...points.map((p) => p.z));

  const byCell = new Map<string, Unit[]>();
  for (const u of visibleUnits) {
    const key = `${u.pos!.x},${u.pos!.z}`;
    const list = byCell.get(key) ?? [];
    list.push(u);
    byCell.set(key, list);
  }
  const markerByCell = new Map<string, string[]>();
  for (const m of markerPoints) {
    const key = `${m.x},${m.z}`;
    const labels = markerByCell.get(key) ?? [];
    labels.push(m.label);
    markerByCell.set(key, labels);
  }

  const pad = 1;
  const cols = maxX - minX + 1 + pad * 2;
  const rows = maxZ - minZ + 1 + pad * 2;
  const maxW = 2200;
  const maxH = 1600;
  const cell = Math.max(
    36,
    Math.min(120, Math.floor(Math.min(maxW / cols, maxH / rows))),
  );
  const chipHForSizing = Math.max(14, Math.floor(cell * 0.18));
  const markerFsForSizing = Math.max(12, Math.floor(cell * 0.18));
  const markerBandH = markerFsForSizing + 8;
  const markerGapH = 4;
  const zToRow = (z: number) => maxZ - z + pad;
  const rowBadgeMax = new Map<number, number>();
  const rowHasMarker = new Map<number, boolean>();
  for (const [key, list] of byCell.entries()) {
    const [, zStr] = key.split(',');
    const z = Number(zStr);
    const rowIndex = zToRow(z);
    const count = collapseUnitEntriesForCell(list).length;
    const prev = rowBadgeMax.get(rowIndex) ?? 0;
    if (count > prev) rowBadgeMax.set(rowIndex, count);
  }
  for (const key of markerByCell.keys()) {
    const [, zStr] = key.split(',');
    const z = Number(zStr);
    const rowIndex = zToRow(z);
    rowHasMarker.set(rowIndex, true);
  }
  const rowHeights: number[] = [];
  for (let r = 0; r < rows; r += 1) {
    const maxBadges = rowBadgeMax.get(r) ?? 0;
    const unitPanelNeed = maxBadges > 0 ? maxBadges * (chipHForSizing + 2) + 8 : 0;
    const markerNeed = rowHasMarker.get(r) ? markerBandH + markerGapH : 0;
    const need = unitPanelNeed + markerNeed;
    rowHeights.push(Math.max(cell, need));
  }

  const margin = 32;
  const width = cols * cell + margin * 2;
  const gridHeight = rowHeights.reduce((a, b) => a + b, 0);
  const height = gridHeight + margin * 2;
  const dpr = 2;

  const canvas = createCanvas(width * dpr, height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  ctx.fillStyle = '#07090f';
  ctx.fillRect(0, 0, width, height);

  const rowStartY: number[] = [];
  let accY = margin;
  for (let r = 0; r < rows; r += 1) {
    rowStartY.push(accY);
    accY += rowHeights[r];
  }
  const toPx = (x: number, z: number) => {
    const rowIndex = zToRow(z);
    return {
      px: margin + (x - minX + pad) * cell,
      py: rowStartY[rowIndex],
      rowIndex,
    };
  };

  // grid
  ctx.strokeStyle = 'rgba(148,163,184,0.18)';
  ctx.lineWidth = 1;
  for (let c = 0; c <= cols; c += 1) {
    const x = margin + c * cell;
    ctx.beginPath();
    ctx.moveTo(x, margin);
    ctx.lineTo(x, margin + gridHeight);
    ctx.stroke();
  }
  let yLine = margin;
  for (let r = 0; r <= rows; r += 1) {
    const y = yLine;
    ctx.beginPath();
    ctx.moveTo(margin, y);
    ctx.lineTo(margin + cols * cell, y);
    ctx.stroke();
    if (r < rows) yLine += rowHeights[r];
  }

  // blocked cells: 밝은 회색 배경 + X 표시
  for (const cellPos of blockedCells) {
    const { px, py } = toPx(cellPos.x, cellPos.z);
    const rowIndex = zToRow(cellPos.z);
    const rowH = rowHeights[rowIndex] ?? cell;
    const inset = 2;
    const w = cell - inset * 2;
    const h = rowH - inset * 2;
    const x = px + inset;
    const y = py + inset;

    ctx.fillStyle = 'rgba(226,232,240,0.28)';
    ctx.fillRect(x, y, w, h);

    ctx.strokeStyle = 'rgba(226,232,240,0.86)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 8, y + 8);
    ctx.lineTo(x + w - 8, y + h - 8);
    ctx.moveTo(x + w - 8, y + 8);
    ctx.lineTo(x + 8, y + h - 8);
    ctx.stroke();
  }

  // coords
  ctx.fillStyle = 'rgba(148,163,184,0.7)';
  ctx.font = `12px ${GRID_FONT_FAMILY}`;
  const gridLabels = (state as any).gridLabels ?? {};
  const xLabelMap =
    gridLabels && typeof gridLabels.x === 'object' && gridLabels.x
      ? (gridLabels.x as Record<string, string>)
      : {};
  const zLabelMap =
    gridLabels && typeof gridLabels.z === 'object' && gridLabels.z
      ? (gridLabels.z as Record<string, string>)
      : {};
  for (let x = minX; x <= maxX; x += 1) {
    const { px } = toPx(x, minZ);
    const label = String(xLabelMap[String(x)] ?? '').trim() || `x:${x}`;
    ctx.fillText(label, px + 4, margin - 10);
  }
  for (let z = minZ; z <= maxZ; z += 1) {
    const { py } = toPx(minX, z);
    const label = String(zLabelMap[String(z)] ?? '').trim() || `z:${z}`;
    ctx.fillText(label, 4, py + 14);
  }

  for (const [key, list] of byCell.entries()) {
    const [xStr, zStr] = key.split(',');
    const x = Number(xStr);
    const z = Number(zStr);
    const { px, py, rowIndex } = toPx(x, z);
    const rowH = rowHeights[rowIndex];
    const collapsed = collapseUnitEntriesForCell(list);
    const chipH = Math.max(14, Math.floor(cell * 0.18));
    const chipW = cell - 8;
    const panelH = collapsed.length * (chipH + 2) + 4;
    const reservedTop = rowHasMarker.get(rowIndex) ? markerBandH + markerGapH : 0;
    const yBase = Math.max(py + reservedTop, py + rowH - panelH - 3);

    for (let i = 0; i < collapsed.length; i += 1) {
      const row = collapsed[i];
      const y = yBase + i * (chipH + 2);
      const x0 = px + 4;
      const fill = unitColorHex(row.unit);
      roundRect(ctx, x0, y, chipW, chipH, 6);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.fillStyle = '#0a0a0a';
      ctx.font = `${Math.max(9, chipH - 6)}px ${GRID_FONT_FAMILY}`;
      ctx.fillText(shortText(row.label, 16), x0 + 5, y + chipH - 4);
    }
  }

  // markers: 원문 라벨(이모지 포함) 그대로, 좌측 상단부터 가로 배열
  for (const [key, labels] of markerByCell.entries()) {
    const [xStr, zStr] = key.split(',');
    const x = Number(xStr);
    const z = Number(zStr);
    const { px, py } = toPx(x, z);
    const fs = markerFsForSizing;
    const y = py + fs + 2;
    let cursorX = px + 4;
    ctx.font = `bold ${fs}px ${GRID_FONT_FAMILY}`;
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
    for (const raw of labels) {
      const text = (raw ?? '').trim();
      if (!text) continue;
      // 마커 가독성: 외곽선 + 본문색
      ctx.strokeStyle = 'rgba(7,9,15,0.95)';
      ctx.lineWidth = Math.max(2, Math.floor(fs * 0.12));
      ctx.strokeText(text, cursorX, y);
      ctx.fillStyle = '#67e8f9';
      ctx.fillText(text, cursorX, y);
      cursorX += ctx.measureText(text).width + 10;
    }
  }

  const buffer = canvas.toBuffer('image/png');
  return new AttachmentBuilder(buffer, { name: 'battle-grid.png' });
}

function collectMarkerPoints(markers: Marker[]): Array<{ x: number; z: number; label: string }> {
  const out: Array<{ x: number; z: number; label: string }> = [];
  for (const m of markers) {
    const label = (m.alias ?? '').trim() || m.name || m.id;
    const cells =
      Array.isArray((m as any).cells) && (m as any).cells.length
        ? (m as any).cells
        : m.pos
          ? [m.pos]
          : [];
    for (const p of cells) {
      if (!p) continue;
      out.push({ x: p.x, z: p.z, label });
    }
  }
  return out;
}

function unitColorHex(u: Unit): string {
  const code = typeof u.colorCode === 'number' ? u.colorCode : null;
  switch (code) {
    case 31:
      return '#f87171';
    case 32:
      return '#86efac';
    case 33:
      return '#fde047';
    case 34:
      return '#60a5fa';
    case 35:
      return '#f472b6';
    case 36:
      return '#67e8f9';
    case 90:
      return '#a1a1aa';
    default:
      break;
  }
  if (u.side === 'TEAM') return '#60a5fa';
  if (u.side === 'ENEMY') return '#f87171';
  return '#cbd5e1';
}

function shortText(v: string, max: number): string {
  const s = (v ?? '').trim();
  if (!s) return '-';
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(1, max - 1))}…`;
}

function splitIdentifierLabel(label: string): { base: string; suffix: string | null } {
  const raw = (label ?? '').trim();
  if (!raw) return { base: raw, suffix: null };

  for (const symbol of IDENTIFIER_SYMBOLS) {
    const bracket = `[${symbol}]`;
    if (raw.endsWith(bracket)) {
      return { base: raw.slice(0, -bracket.length), suffix: symbol };
    }
  }
  for (const symbol of IDENTIFIER_SYMBOLS) {
    if (raw.endsWith(symbol)) {
      return { base: raw.slice(0, -symbol.length), suffix: symbol };
    }
  }
  return { base: raw, suffix: null };
}

function collapseUnitEntriesForCell(units: Unit[]): Array<{ unit: Unit; label: string }> {
  const entries = units.map((u) => ({
    unit: u,
    label: getUnitLabel(u),
  }));
  const grouped: Array<{ unit: Unit; base: string; label: string; suffixes: string[] | null }> =
    [];
  const groupIndex = new Map<string, number>();

  for (const entry of entries) {
    const { base, suffix } = splitIdentifierLabel(entry.label);
    if (suffix && base) {
      const idx = groupIndex.get(base);
      if (idx !== undefined) {
        grouped[idx].suffixes?.push(suffix);
      } else {
        grouped.push({
          unit: entry.unit,
          base,
          label: entry.label,
          suffixes: [suffix],
        });
        groupIndex.set(base, grouped.length - 1);
      }
      continue;
    }
    grouped.push({
      unit: entry.unit,
      base: entry.label,
      label: entry.label,
      suffixes: null,
    });
  }

  const out: Array<{ unit: Unit; label: string }> = [];
  for (const g of grouped) {
    if (!g.suffixes || g.suffixes.length === 0) {
      out.push({ unit: g.unit, label: g.label });
      continue;
    }
    // 배지당 최대 4기까지 압축, 초과분은 별도 배지로 분리
    for (let i = 0; i < g.suffixes.length; i += 4) {
      const part = g.suffixes.slice(i, i + 4);
      out.push({
        unit: g.unit,
        label: `${g.base}${part.join('')}`,
      });
    }
  }
  return out;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.max(0, Math.min(r, Math.floor(Math.min(w, h) / 2)));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
