import { PrismaClient } from '@prisma/client';

type TileRegionState = {
  spaceUsed?: number;
  spaceCap?: number;
  satisfaction?: number;
  threat?: number;
  pollution?: number;
};

const prisma = new PrismaClient();

function toTruncIntOrUndef(value: unknown): number | undefined {
  if (value === null || value === undefined || String(value).trim() === '') return undefined;
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return undefined;
  return n;
}

function normalizeTileRegionStates(input: unknown): Record<string, TileRegionState> {
  const src = input as Record<string, unknown>;
  if (!src || typeof src !== 'object') return {};
  const out: Record<string, TileRegionState> = {};

  for (const [key, value] of Object.entries(src)) {
    if (!value || typeof value !== 'object') continue;
    const cast = value as Partial<TileRegionState>;
    const next: TileRegionState = {
      spaceUsed: toTruncIntOrUndef(cast.spaceUsed),
      spaceCap: toTruncIntOrUndef(cast.spaceCap),
      satisfaction: toTruncIntOrUndef(cast.satisfaction),
      // Keep signed value (no clamp) for threat.
      threat: toTruncIntOrUndef(cast.threat),
      pollution: toTruncIntOrUndef(cast.pollution),
    };
    if (
      next.spaceUsed !== undefined ||
      next.spaceCap !== undefined ||
      next.satisfaction !== undefined ||
      next.threat !== undefined ||
      next.pollution !== undefined
    ) {
      out[key] = next;
    }
  }
  return out;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const rows = await prisma.worldMap.findMany({
    select: { id: true, name: true, tileRegionStates: true },
  });

  let changedCount = 0;
  for (const row of rows) {
    const normalized = normalizeTileRegionStates(row.tileRegionStates);
    const before = JSON.stringify(row.tileRegionStates ?? {});
    const after = JSON.stringify(normalized);
    if (before === after) continue;
    changedCount += 1;
    if (apply) {
      await prisma.worldMap.update({
        where: { id: row.id },
        data: { tileRegionStates: normalized },
      });
    }
  }

  if (apply) {
    console.log(`[migrate-world-map-threat-signed] updated maps: ${changedCount}/${rows.length}`);
  } else {
    console.log(
      `[migrate-world-map-threat-signed] dry-run changed maps: ${changedCount}/${rows.length} (re-run with --apply to write)`,
    );
  }
}

main()
  .catch((err) => {
    console.error('[migrate-world-map-threat-signed] failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

