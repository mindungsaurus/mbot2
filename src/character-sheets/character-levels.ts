export type CasterProgressionValue = 'NONE' | 'FULL' | 'HALF' | 'THIRD';

export type CharacterClassLevelSource = {
  level: number;
  classDefinition?: {
    casterProgression?: CasterProgressionValue | string | null;
  } | null;
};

export function casterLevelContribution(
  level: number,
  progression: CasterProgressionValue | string | null | undefined,
) {
  const safeLevel = Number.isFinite(level) ? Math.max(0, Math.trunc(level)) : 0;
  switch (progression) {
    case 'FULL':
      return safeLevel;
    case 'HALF':
      return Math.floor(safeLevel / 2);
    case 'THIRD':
      return Math.floor(safeLevel / 3);
    default:
      return 0;
  }
}

export function calculateCharacterClassLevels(
  classes: CharacterClassLevelSource[],
) {
  return classes.reduce(
    (acc, entry) => {
      const level = Number.isFinite(entry.level)
        ? Math.max(0, Math.trunc(entry.level))
        : 0;
      acc.totalLevel += level;
      acc.effectiveCasterLevel += casterLevelContribution(
        level,
        entry.classDefinition?.casterProgression,
      );
      return acc;
    },
    { totalLevel: 0, effectiveCasterLevel: 0 },
  );
}
