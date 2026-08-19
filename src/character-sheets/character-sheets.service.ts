import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  CHARACTER_FEATURE_KINDS,
  CharacterFeatureKind,
  EQUIPMENT_OCCUPANCY_SLOTS,
  EQUIPMENT_SLOTS,
  EquipmentOccupancySlot,
  EquipmentSlot,
} from './character-sheets.constants';
import {
  CasterProgressionValue,
  calculateCharacterClassLevels,
} from './character-levels';
import {
  CharacterClassFeatureTargetValue,
  calculateAutomaticClassFeatures,
  calculateAutomaticClassSpells,
  calculateAutomaticClassTechniques,
} from './character-class-features';

type SheetPatch = {
  race?: string | null;
  age?: string | null;
  height?: string | null;
  weight?: string | null;
  hpCur?: number | null;
  hpMax?: number | null;
  ac?: number | null;
  strength?: number | null;
  dexterity?: number | null;
  constitution?: number | null;
  intelligence?: number | null;
  wisdom?: number | null;
  charisma?: number | null;
  proficiencies?: unknown;
  spellSlots?: unknown;
  metamagic?: unknown;
  spellVariants?: unknown;
  spells?: unknown;
  notes?: unknown;
};

type FeaturePatch = {
  kind?: string;
  name?: string;
  description?: string;
  order?: number;
};

type ItemProfileEffectPatch = {
  name: string;
  description: string;
  order: number;
};

type ItemProfileSearchParams = {
  query?: string;
  page?: string;
  pageSize?: string;
};

type ReferenceSearchParams = {
  query?: string;
  pageSize?: string;
};

type CharacterClassPatch = {
  classDefinitionId?: string;
  subclassDefinitionId?: string | null;
  level?: unknown;
};

type ClassFeaturePatch = {
  level?: unknown;
  name?: string;
  description?: string;
  target?: unknown;
  order?: unknown;
  branchOptionId?: unknown;
  skillEntryId?: unknown;
  spellEntryId?: unknown;
  defaultSheetVisible?: unknown;
};

type ChoiceGroupPatch = {
  level?: unknown;
  name?: unknown;
  description?: unknown;
  selectionCount?: unknown;
  order?: unknown;
  branchOptionId?: unknown;
};

type ChoiceOptionPatch = {
  name?: string;
  description?: string;
  target?: unknown;
  order?: unknown;
  skillEntryId?: unknown;
  spellEntryId?: unknown;
  defaultSheetVisible?: unknown;
};

type AdditionalRewardPatch = {
  rewardType?: unknown;
  name?: unknown;
  description?: unknown;
  order?: unknown;
  skillEntryId?: unknown;
  spellEntryId?: unknown;
  referencedFeatureDefinitionId?: unknown;
  referencedChoiceOptionId?: unknown;
  referencedChoiceGroupId?: unknown;
};

type FeatureUpgradePatch = {
  targetType?: unknown;
  targetFeatureDefinitionId?: unknown;
  targetChoiceOptionId?: unknown;
  unlockLevel?: unknown;
  name?: unknown;
  description?: unknown;
  displayOrder?: unknown;
  branchOptionId?: unknown;
};

type FeatureOverridePatch = {
  targetType?: unknown;
  targetFeatureDefinitionId?: unknown;
  targetChoiceOptionId?: unknown;
  visibility?: unknown;
  suppressed?: unknown;
  note?: unknown;
};

type ChoiceSelectionPatch = {
  choiceOptionIds?: unknown;
};

type BranchGroupPatch = {
  name?: unknown;
  description?: unknown;
  unlockLevel?: unknown;
  displayOrder?: unknown;
};

type BranchOptionPatch = {
  name?: unknown;
  description?: unknown;
  displayOrder?: unknown;
};

type BranchSelectionPatch = {
  branchOptionId?: unknown;
};

type SkillEntryPatch = {
  jobName?: unknown;
  skillName?: unknown;
  conditionText?: unknown;
  titleRaw?: unknown;
  bodyRaw?: unknown;
  sourceMessageUrl?: unknown;
  sourceChannelName?: unknown;
  sourceThreadName?: unknown;
};

type SpellEntryPatch = {
  spellLevel?: unknown;
  spellNumber?: unknown;
  spellName?: unknown;
  titleRaw?: unknown;
  school?: unknown;
  rangeText?: unknown;
  damage?: unknown;
  learnText?: unknown;
  checkText?: unknown;
  concentration?: unknown;
  duration?: unknown;
  castCost?: unknown;
  etcText?: unknown;
  commentText?: unknown;
  componentsText?: unknown;
  bodyRaw?: unknown;
  sourceMessageUrl?: unknown;
  sourceChannelName?: unknown;
  sourceThreadName?: unknown;
};

const SLOT_SET = new Set<string>(EQUIPMENT_SLOTS);
const OCCUPANCY_SLOT_SET = new Set<string>(EQUIPMENT_OCCUPANCY_SLOTS);
const FEATURE_KIND_SET = new Set<string>(CHARACTER_FEATURE_KINDS);
const LEGACY_RING_SLOT_SET = new Set(['반지1', '반지2', '반지3', '반지4']);
const RING_SLOT_LIMIT = 4;
const DEFAULT_OCCUPIES_SLOTS: EquipmentOccupancySlot[] = ['선택 슬롯'];
const PROFILE_PAGE_SIZE = 20;
const CASTER_PROGRESSION_VALUES = new Set<CasterProgressionValue>([
  'NONE',
  'FULL',
  'HALF',
  'THIRD',
]);
const CLASS_FEATURE_TARGETS = new Set<CharacterClassFeatureTargetValue>([
  'TRAIT',
  'FEAT',
  'TECHNIQUE',
  'SPELL',
  'METAMAGIC',
  'FIGHTING_STYLE',
  'RESOURCE_OR_SLOT',
  'CUSTOM',
]);
const CLASS_CHOICE_OPTION_TARGETS = new Set<CharacterClassFeatureTargetValue>([
  'TRAIT',
  'FEAT',
  'TECHNIQUE',
  'SPELL',
]);
const ADDITIONAL_REWARD_TYPES = new Set([
  'TRAIT',
  'FEAT',
  'TECHNIQUE',
  'SPELL',
  'GRANT_FEATURE',
  'GRANT_CHOICE_OPTION',
  'GRANT_UNACQUIRED_CHOICE_OPTIONS',
]);
const FEATURE_VISIBILITY_OVERRIDES = new Set([
  'DEFAULT',
  'FORCE_SHOW',
  'FORCE_HIDE',
]);

function normalizePage(value: unknown) {
  const page = Math.trunc(Number(value ?? 1));
  if (!Number.isFinite(page) || page < 1) return 1;
  return page;
}

function normalizePageSize(
  value: unknown,
  fallback = PROFILE_PAGE_SIZE,
  max = 50,
) {
  const pageSize = Math.trunc(Number(value ?? fallback));
  if (!Number.isFinite(pageSize) || pageSize < 1) return fallback;
  return Math.min(pageSize, max);
}

function textOrNull(value: unknown) {
  if (value === null) return null;
  if (value === undefined) return undefined;
  const text = String(value).trim();
  return text.length ? text : null;
}

function booleanOrDefault(value: unknown, fallback: boolean) {
  if (value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return !!value;
}

function requiredText(value: unknown, label: string) {
  const text = String(value ?? '').trim();
  if (!text) throw new BadRequestException(`${label} required`);
  return text;
}

function normalizeReferenceName(value: string) {
  return value.toLowerCase().replace(/\s+/g, '');
}

function intOrNull(value: unknown) {
  if (value === null) return null;
  if (value === undefined) return undefined;
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return null;
  return n;
}

function positiveIntOrNull(value: unknown) {
  if (value === null) return null;
  if (value === undefined) return undefined;
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

function positiveInt(value: unknown) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n) || n < 1) {
    throw new BadRequestException('level must be a positive integer');
  }
  return n;
}

function normalizeOptionalPositiveInt(value: unknown) {
  if (value === null) return null;
  if (value === undefined) return undefined;
  const text = String(value ?? '').trim();
  if (!text) return null;
  const n = Math.trunc(Number(text));
  if (!Number.isFinite(n) || n < 1) {
    throw new BadRequestException(
      'subclassChoiceLevel must be a positive integer',
    );
  }
  return n;
}

function normalizeCasterProgression(value: unknown): CasterProgressionValue {
  const normalized = String(value ?? 'NONE')
    .trim()
    .toUpperCase();
  if (CASTER_PROGRESSION_VALUES.has(normalized as CasterProgressionValue)) {
    return normalized as CasterProgressionValue;
  }
  throw new BadRequestException('invalid casterProgression');
}

function normalizeClassFeatureTarget(
  value: unknown,
): CharacterClassFeatureTargetValue {
  const normalized = String(value ?? 'TRAIT')
    .trim()
    .toUpperCase();
  if (
    CLASS_FEATURE_TARGETS.has(normalized as CharacterClassFeatureTargetValue)
  ) {
    return normalized as CharacterClassFeatureTargetValue;
  }
  throw new BadRequestException('invalid class feature target');
}

function normalizeAdditionalRewardType(value: unknown) {
  const normalized = String(value ?? 'TRAIT')
    .trim()
    .toUpperCase();
  if (ADDITIONAL_REWARD_TYPES.has(normalized)) return normalized;
  throw new BadRequestException('invalid additional reward type');
}

function normalizeSlotKey(value: unknown): EquipmentSlot | null {
  const slot = String(value ?? '').trim();
  if (LEGACY_RING_SLOT_SET.has(slot)) return '반지';
  if (SLOT_SET.has(slot)) return slot as EquipmentSlot;
  return null;
}

function normalizeSlots(value: unknown): EquipmentSlot[] {
  const raw = Array.isArray(value) ? value : [];
  const out: EquipmentSlot[] = [];
  for (const entry of raw) {
    const slot = normalizeSlotKey(entry);
    if (!slot) continue;
    if (!out.includes(slot)) out.push(slot);
  }
  return out;
}

function normalizeOccupancySlots(value: unknown): EquipmentOccupancySlot[] {
  const raw = Array.isArray(value) ? value : [];
  const out: EquipmentOccupancySlot[] = [];
  for (const entry of raw) {
    const slot = String(entry ?? '').trim();
    const normalized = LEGACY_RING_SLOT_SET.has(slot) ? '반지' : slot;
    if (!OCCUPANCY_SLOT_SET.has(normalized)) continue;
    if (!out.includes(normalized as EquipmentOccupancySlot)) {
      out.push(normalized as EquipmentOccupancySlot);
    }
  }
  return out;
}

function normalizeFeatureKind(value: unknown): CharacterFeatureKind {
  const kind = String(value ?? '').trim();
  if (FEATURE_KIND_SET.has(kind)) return kind as CharacterFeatureKind;
  return 'NOTE';
}

function hasSlotOverlap(a: EquipmentSlot[], b: EquipmentSlot[]) {
  return a.some((slot) => slot !== '반지' && b.includes(slot));
}

function resolveOccupiedSlots(
  occupiesSlots: EquipmentOccupancySlot[],
  selectedSlot: EquipmentSlot,
): EquipmentSlot[] {
  const out: EquipmentSlot[] = [];
  for (const slot of occupiesSlots) {
    const resolved = slot === '선택 슬롯' ? selectedSlot : slot;
    if (!out.includes(resolved)) out.push(resolved);
  }
  return out;
}

function normalizeItemProfileEffects(value: unknown): ItemProfileEffectPatch[] {
  if (!Array.isArray(value)) return [];
  const out: ItemProfileEffectPatch[] = [];
  value.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return;
    const record = entry as Record<string, unknown>;
    const name = String(record.name ?? '').trim();
    if (!name) return;
    out.push({
      name,
      description: String(record.description ?? '').trim(),
      order: intOrNull(record.order) ?? index * 10 + 10,
    });
  });
  return out;
}

function normalizeItemProfile(profile: any) {
  return {
    ...profile,
    allowedSlots: normalizeSlots(profile.allowedSlots),
    occupiesSlots: normalizeOccupancySlots(profile.occupiesSlots),
    effects: Array.isArray(profile.effects)
      ? profile.effects
          .slice()
          .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
          .map((effect: any) => ({
            id: effect.id,
            itemName: profile.itemName,
            name: effect.name,
            description: effect.description,
            order: effect.order ?? 0,
          }))
      : [],
  };
}

const ITEM_PROFILE_INCLUDE = {
  item: { select: { quality: true, type: true, unit: true } },
  effects: {
    orderBy: [{ order: 'asc' as const }, { createdAt: 'asc' as const }],
  },
};

const ADDITIONAL_REWARD_INCLUDE = {
  skillEntry: true,
  spellEntry: true,
  referencedFeatureDefinition: {
    include: {
      skillEntry: true,
      spellEntry: true,
      branchOption: true,
      classDefinition: { select: { id: true, name: true } },
      subclassDefinition: {
        select: {
          id: true,
          name: true,
          classDefinition: { select: { id: true, name: true } },
        },
      },
    },
  },
  referencedChoiceOption: {
    include: {
      skillEntry: true,
      spellEntry: true,
      choiceGroup: {
        include: {
          branchOption: true,
          classDefinition: { select: { id: true, name: true } },
          subclassDefinition: {
            select: {
              id: true,
              name: true,
              classDefinition: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  },
  referencedChoiceGroup: {
    include: {
      branchOption: true,
      classDefinition: { select: { id: true, name: true } },
      subclassDefinition: {
        select: {
          id: true,
          name: true,
          classDefinition: { select: { id: true, name: true } },
        },
      },
    },
  },
};

const ADDITIONAL_REWARDS_INCLUDE_ORDERED = {
  include: ADDITIONAL_REWARD_INCLUDE,
  orderBy: [{ order: 'asc' as const }, { createdAt: 'asc' as const }],
};

const FEATURE_UPGRADES_INCLUDE_ORDERED = {
  include: {
    branchOption: { include: { branchGroup: true } },
  },
  orderBy: [
    { unlockLevel: 'asc' as const },
    { displayOrder: 'asc' as const },
    { createdAt: 'asc' as const },
  ],
};

const CHOICE_OPTION_INCLUDE = {
  skillEntry: true,
  spellEntry: true,
  additionalRewards: ADDITIONAL_REWARDS_INCLUDE_ORDERED,
  upgrades: FEATURE_UPGRADES_INCLUDE_ORDERED,
};

const BRANCH_GROUP_INCLUDE = {
  options: {
    orderBy: [{ displayOrder: 'asc' as const }, { createdAt: 'asc' as const }],
  },
};

const CHOICE_GROUP_INCLUDE = {
  branchOption: { include: { branchGroup: true } },
  options: {
    include: CHOICE_OPTION_INCLUDE,
    orderBy: [{ order: 'asc' as const }, { createdAt: 'asc' as const }],
  },
};

const CLASS_DEFINITION_INCLUDE = {
  features: {
    include: {
      skillEntry: true,
      spellEntry: true,
      branchOption: true,
      additionalRewards: ADDITIONAL_REWARDS_INCLUDE_ORDERED,
      upgrades: FEATURE_UPGRADES_INCLUDE_ORDERED,
    },
    orderBy: [
      { level: 'asc' as const },
      { order: 'asc' as const },
      { createdAt: 'asc' as const },
    ],
  },
  choiceGroups: {
    include: {
      branchOption: true,
      options: {
        include: CHOICE_OPTION_INCLUDE,
        orderBy: [{ order: 'asc' as const }, { createdAt: 'asc' as const }],
      },
    },
    orderBy: [
      { level: 'asc' as const },
      { order: 'asc' as const },
      { createdAt: 'asc' as const },
    ],
  },
  subclasses: {
    include: {
      features: {
        include: {
          skillEntry: true,
          spellEntry: true,
          branchOption: true,
          additionalRewards: ADDITIONAL_REWARDS_INCLUDE_ORDERED,
          upgrades: FEATURE_UPGRADES_INCLUDE_ORDERED,
        },
        orderBy: [
          { level: 'asc' as const },
          { order: 'asc' as const },
          { createdAt: 'asc' as const },
        ],
      },
      choiceGroups: {
        include: {
          branchOption: true,
          options: {
            include: CHOICE_OPTION_INCLUDE,
            orderBy: [{ order: 'asc' as const }, { createdAt: 'asc' as const }],
          },
        },
        orderBy: [
          { level: 'asc' as const },
          { order: 'asc' as const },
          { createdAt: 'asc' as const },
        ],
      },
      branchGroups: {
        include: BRANCH_GROUP_INCLUDE,
        orderBy: [
          { unlockLevel: 'asc' as const },
          { displayOrder: 'asc' as const },
          { createdAt: 'asc' as const },
        ],
      },
    },
    orderBy: { name: 'asc' as const },
  },
  branchGroups: {
    include: BRANCH_GROUP_INCLUDE,
    orderBy: [
      { unlockLevel: 'asc' as const },
      { displayOrder: 'asc' as const },
      { createdAt: 'asc' as const },
    ],
  },
};

const CHARACTER_CLASS_INCLUDE = {
  classDefinition: {
    include: {
      features: {
        include: {
          skillEntry: true,
          spellEntry: true,
          branchOption: true,
          additionalRewards: ADDITIONAL_REWARDS_INCLUDE_ORDERED,
          upgrades: FEATURE_UPGRADES_INCLUDE_ORDERED,
        },
        orderBy: [
          { level: 'asc' as const },
          { order: 'asc' as const },
          { createdAt: 'asc' as const },
        ],
      },
      choiceGroups: {
        include: {
          branchOption: true,
          options: {
            include: CHOICE_OPTION_INCLUDE,
            orderBy: [{ order: 'asc' as const }, { createdAt: 'asc' as const }],
          },
        },
        orderBy: [
          { level: 'asc' as const },
          { order: 'asc' as const },
          { createdAt: 'asc' as const },
        ],
      },
      branchGroups: {
        include: BRANCH_GROUP_INCLUDE,
        orderBy: [
          { unlockLevel: 'asc' as const },
          { displayOrder: 'asc' as const },
          { createdAt: 'asc' as const },
        ],
      },
    },
  },
  subclassDefinition: {
    include: {
      features: {
        include: {
          skillEntry: true,
          spellEntry: true,
          branchOption: true,
          additionalRewards: ADDITIONAL_REWARDS_INCLUDE_ORDERED,
          upgrades: FEATURE_UPGRADES_INCLUDE_ORDERED,
        },
        orderBy: [
          { level: 'asc' as const },
          { order: 'asc' as const },
          { createdAt: 'asc' as const },
        ],
      },
      choiceGroups: {
        include: {
          branchOption: true,
          options: {
            include: CHOICE_OPTION_INCLUDE,
            orderBy: [{ order: 'asc' as const }, { createdAt: 'asc' as const }],
          },
        },
        orderBy: [
          { level: 'asc' as const },
          { order: 'asc' as const },
          { createdAt: 'asc' as const },
        ],
      },
      branchGroups: {
        include: BRANCH_GROUP_INCLUDE,
        orderBy: [
          { unlockLevel: 'asc' as const },
          { displayOrder: 'asc' as const },
          { createdAt: 'asc' as const },
        ],
      },
    },
  },
  choiceSelections: {
    orderBy: { createdAt: 'asc' as const },
  },
  branchSelections: {
    include: {
      branchGroup: true,
      branchOption: true,
    },
    orderBy: { createdAt: 'asc' as const },
  },
};

function normalizeCharacterClass(entry: any) {
  return {
    id: entry.id,
    characterSheetId: entry.characterSheetId,
    classDefinitionId: entry.classDefinitionId,
    subclassDefinitionId: entry.subclassDefinitionId,
    level: entry.level,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    classDefinition: entry.classDefinition,
    subclassDefinition: entry.subclassDefinition,
    choiceSelections: entry.choiceSelections ?? [],
    branchSelections: entry.branchSelections ?? [],
  };
}

@Injectable()
export class CharacterSheetsService {
  constructor(private readonly prisma: PrismaClient) {}

  getEquipmentSlots() {
    return [...EQUIPMENT_SLOTS];
  }

  async getDetail(characterName: string) {
    const name = this.normalizeCharacterName(characterName);
    const character = await this.prisma.characterGold.findUnique({
      where: { name },
    });
    if (!character)
      throw new NotFoundException(`Character "${name}" not found`);

    const [sheet, equipment, features, inventory, itemProfiles] =
      await Promise.all([
        this.prisma.characterSheet.findUnique({
          where: { characterName: name },
          include: {
            classes: {
              include: CHARACTER_CLASS_INCLUDE,
              orderBy: { createdAt: 'asc' },
            },
            featureOverrides: {
              orderBy: { createdAt: 'asc' },
            },
          },
        }),
        this.prisma.characterEquipment.findMany({
          where: { characterName: name },
          orderBy: { createdAt: 'asc' },
        }),
        this.prisma.characterFeature.findMany({
          where: { characterName: name },
          orderBy: [{ kind: 'asc' }, { order: 'asc' }, { createdAt: 'asc' }],
        }),
        this.prisma.inventory.findMany({
          where: { owner: name },
          orderBy: { itemName: 'asc' },
        }),
        this.prisma.itemEquipmentProfile.findMany({
          include: ITEM_PROFILE_INCLUDE,
          orderBy: { itemName: 'asc' },
        }),
      ]);
    const characterClasses = sheet?.classes ?? [];
    const featureOverrides = sheet?.featureOverrides ?? [];
    const classLevels = calculateCharacterClassLevels(characterClasses);
    const automaticClassFeatures = calculateAutomaticClassFeatures(
      characterClasses,
      featureOverrides,
    );

    return {
      character,
      sheet: sheet
        ? {
            ...sheet,
            classes: undefined,
            featureOverrides: undefined,
          }
        : null,
      characterClasses: characterClasses.map(normalizeCharacterClass),
      featureOverrides,
      automaticClassFeatures,
      automaticClassTechniques: calculateAutomaticClassTechniques(
        automaticClassFeatures,
      ),
      automaticClassSpells: calculateAutomaticClassSpells(
        automaticClassFeatures,
      ),
      totalLevel: classLevels.totalLevel,
      effectiveCasterLevel: classLevels.effectiveCasterLevel,
      equipment: equipment.map((entry) => ({
        ...entry,
        slots: normalizeSlots(entry.slots),
      })),
      features,
      inventory,
      itemProfiles: itemProfiles.map(normalizeItemProfile),
    };
  }

  async listItemProfiles() {
    const profiles = await this.prisma.itemEquipmentProfile.findMany({
      include: ITEM_PROFILE_INCLUDE,
      orderBy: { itemName: 'asc' },
    });
    return profiles.map(normalizeItemProfile);
  }

  async getItemProfile(itemName: string) {
    const name = String(itemName ?? '').trim();
    if (!name) throw new BadRequestException('itemName required');
    const profile = await this.prisma.itemEquipmentProfile.findUnique({
      where: { itemName: name },
      include: ITEM_PROFILE_INCLUDE,
    });
    return profile ? normalizeItemProfile(profile) : null;
  }

  async searchItemProfiles(params: ItemProfileSearchParams) {
    const query = String(params.query ?? '').trim();
    const page = normalizePage(params.page);
    const pageSize = normalizePageSize(params.pageSize);
    const where = query
      ? { itemName: { contains: query, mode: 'insensitive' as const } }
      : {};

    const totalItems = await this.prisma.itemEquipmentProfile.count({ where });
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const safePage = Math.min(page, totalPages);
    const profiles = await this.prisma.itemEquipmentProfile.findMany({
      where,
      include: ITEM_PROFILE_INCLUDE,
      orderBy: { itemName: 'asc' },
      skip: (safePage - 1) * pageSize,
      take: pageSize,
    });

    return {
      page: safePage,
      pageSize,
      totalItems,
      totalPages,
      hasPrev: safePage > 1,
      hasNext: safePage < totalPages,
      items: profiles.map(normalizeItemProfile),
    };
  }

  async searchSkillReferences(params: ReferenceSearchParams) {
    const query = String(params.query ?? '').trim();
    const pageSize = normalizePageSize(params.pageSize, 20, 25);
    if (query.length < 1) return [];
    const normalized = query.toLowerCase().replace(/\s+/g, '');
    return this.prisma.skillEntry.findMany({
      where: {
        OR: [
          { skillName: { contains: query, mode: 'insensitive' } },
          { titleRaw: { contains: query, mode: 'insensitive' } },
          { jobName: { contains: query, mode: 'insensitive' } },
          { normalizedName: { contains: normalized, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        skillKey: true,
        sourceMessageId: true,
        jobName: true,
        skillName: true,
        conditionText: true,
        titleRaw: true,
        bodyRaw: true,
        sourceMessageUrl: true,
        sourceChannelName: true,
        sourceThreadName: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ skillName: 'asc' }, { jobName: 'asc' }],
      take: pageSize,
    });
  }

  async searchSpellReferences(params: ReferenceSearchParams) {
    const query = String(params.query ?? '').trim();
    const pageSize = normalizePageSize(params.pageSize, 20, 25);
    if (query.length < 1) return [];
    const normalized = query.toLowerCase().replace(/\s+/g, '');
    return this.prisma.spellEntry.findMany({
      where: {
        OR: [
          { spellName: { contains: query, mode: 'insensitive' } },
          { titleRaw: { contains: query, mode: 'insensitive' } },
          { spellLevel: { contains: query, mode: 'insensitive' } },
          { school: { contains: query, mode: 'insensitive' } },
          { normalizedName: { contains: normalized, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        spellKey: true,
        sourceMessageId: true,
        spellLevel: true,
        spellNumber: true,
        spellName: true,
        titleRaw: true,
        school: true,
        rangeText: true,
        damage: true,
        learnText: true,
        checkText: true,
        concentration: true,
        duration: true,
        castCost: true,
        etcText: true,
        commentText: true,
        componentsText: true,
        bodyRaw: true,
        sourceMessageUrl: true,
        sourceChannelName: true,
        sourceThreadName: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [
        { spellLevel: 'asc' },
        { spellNumber: 'asc' },
        { spellName: 'asc' },
      ],
      take: pageSize,
    });
  }

  async createSkillReference(body: SkillEntryPatch) {
    const jobName = requiredText(body.jobName, 'jobName');
    const skillName = requiredText(body.skillName, 'skillName');
    const conditionText = textOrNull(body.conditionText) ?? null;
    const titleRaw =
      textOrNull(body.titleRaw) ??
      `${skillName}${conditionText ? ` ${conditionText}` : ''}`;
    const bodyRaw = requiredText(body.bodyRaw, 'bodyRaw');
    return this.prisma.skillEntry.create({
      data: {
        skillKey: `${normalizeReferenceName(jobName)}:${normalizeReferenceName(
          skillName,
        )}`,
        sourceMessageId: `operator-ui-skill-${randomUUID()}`,
        sourceMessageUrl: String(body.sourceMessageUrl ?? '').trim(),
        sourceChannelId: 'operator-ui',
        sourceChannelName: textOrNull(body.sourceChannelName) ?? 'operator-ui',
        sourceThreadId: null,
        sourceThreadName: textOrNull(body.sourceThreadName) ?? null,
        jobName,
        skillName,
        conditionText,
        titleRaw,
        normalizedName: normalizeReferenceName(skillName),
        bodyRaw,
      },
    });
  }

  async updateSkillReference(skillEntryId: string, body: SkillEntryPatch) {
    const id = positiveInt(skillEntryId);
    const current = await this.prisma.skillEntry.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('skill entry not found');
    const jobName =
      body.jobName !== undefined
        ? requiredText(body.jobName, 'jobName')
        : current.jobName;
    const skillName =
      body.skillName !== undefined
        ? requiredText(body.skillName, 'skillName')
        : current.skillName;
    const data: Record<string, unknown> = {
      jobName,
      skillName,
      skillKey: `${normalizeReferenceName(jobName)}:${normalizeReferenceName(
        skillName,
      )}`,
      normalizedName: normalizeReferenceName(skillName),
    };
    if (body.conditionText !== undefined) {
      data.conditionText = textOrNull(body.conditionText) ?? null;
    }
    if (body.titleRaw !== undefined) {
      data.titleRaw = requiredText(body.titleRaw, 'titleRaw');
    }
    if (body.bodyRaw !== undefined) {
      data.bodyRaw = requiredText(body.bodyRaw, 'bodyRaw');
    }
    if (body.sourceMessageUrl !== undefined) {
      data.sourceMessageUrl = String(body.sourceMessageUrl ?? '').trim();
    }
    if (body.sourceChannelName !== undefined) {
      data.sourceChannelName =
        textOrNull(body.sourceChannelName) ?? 'operator-ui';
    }
    if (body.sourceThreadName !== undefined) {
      data.sourceThreadName = textOrNull(body.sourceThreadName) ?? null;
    }
    return this.prisma.skillEntry.update({
      where: { id },
      data,
    });
  }

  async createSpellReference(body: SpellEntryPatch) {
    const spellLevel = requiredText(body.spellLevel, 'spellLevel');
    const spellName = requiredText(body.spellName, 'spellName');
    const spellNumber = intOrNull(body.spellNumber);
    const titleRaw =
      textOrNull(body.titleRaw) ??
      (spellNumber ? `${spellNumber}. ${spellName}` : spellName);
    const bodyRaw = requiredText(body.bodyRaw, 'bodyRaw');
    return this.prisma.spellEntry.create({
      data: {
        spellKey: `${spellLevel}:${
          spellNumber ?? normalizeReferenceName(spellName)
        }`,
        sourceMessageId: `operator-ui-spell-${randomUUID()}`,
        sourceMessageUrl: String(body.sourceMessageUrl ?? '').trim(),
        sourceChannelId: 'operator-ui',
        sourceChannelName: textOrNull(body.sourceChannelName) ?? 'operator-ui',
        sourceThreadId: null,
        sourceThreadName: textOrNull(body.sourceThreadName) ?? null,
        spellLevel,
        spellNumber,
        spellName,
        titleRaw,
        normalizedName: normalizeReferenceName(spellName),
        school: textOrNull(body.school) ?? null,
        rangeText: textOrNull(body.rangeText) ?? null,
        damage: textOrNull(body.damage) ?? null,
        learnText: textOrNull(body.learnText) ?? null,
        checkText: textOrNull(body.checkText) ?? null,
        concentration: textOrNull(body.concentration) ?? null,
        duration: textOrNull(body.duration) ?? null,
        castCost: textOrNull(body.castCost) ?? null,
        etcText: textOrNull(body.etcText) ?? null,
        commentText: textOrNull(body.commentText) ?? null,
        componentsText: textOrNull(body.componentsText) ?? null,
        bodyRaw,
      },
    });
  }

  async updateSpellReference(spellEntryId: string, body: SpellEntryPatch) {
    const id = positiveInt(spellEntryId);
    const current = await this.prisma.spellEntry.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('spell entry not found');
    const spellLevel =
      body.spellLevel !== undefined
        ? requiredText(body.spellLevel, 'spellLevel')
        : current.spellLevel;
    const spellName =
      body.spellName !== undefined
        ? requiredText(body.spellName, 'spellName')
        : current.spellName;
    const spellNumber =
      body.spellNumber !== undefined
        ? intOrNull(body.spellNumber)
        : current.spellNumber;
    const data: Record<string, unknown> = {
      spellLevel,
      spellNumber,
      spellName,
      spellKey: `${spellLevel}:${
        spellNumber ?? normalizeReferenceName(spellName)
      }`,
      normalizedName: normalizeReferenceName(spellName),
    };
    if (body.titleRaw !== undefined) {
      data.titleRaw = requiredText(body.titleRaw, 'titleRaw');
    }
    for (const key of [
      'school',
      'rangeText',
      'damage',
      'learnText',
      'checkText',
      'concentration',
      'duration',
      'castCost',
      'etcText',
      'commentText',
      'componentsText',
      'sourceThreadName',
    ] as const) {
      if (body[key] !== undefined) data[key] = textOrNull(body[key]) ?? null;
    }
    if (body.bodyRaw !== undefined) {
      data.bodyRaw = requiredText(body.bodyRaw, 'bodyRaw');
    }
    if (body.sourceMessageUrl !== undefined) {
      data.sourceMessageUrl = String(body.sourceMessageUrl ?? '').trim();
    }
    if (body.sourceChannelName !== undefined) {
      data.sourceChannelName =
        textOrNull(body.sourceChannelName) ?? 'operator-ui';
    }
    return this.prisma.spellEntry.update({
      where: { id },
      data,
    });
  }

  async updateSheet(characterName: string, patch: SheetPatch) {
    const name = this.normalizeCharacterName(characterName);
    await this.assertCharacterExists(name);

    const data = this.normalizeSheetPatch(patch);
    return this.prisma.characterSheet.upsert({
      where: { characterName: name },
      update: data,
      create: {
        characterName: name,
        ...data,
      },
    });
  }

  async listClassDefinitions() {
    return this.prisma.characterClassDefinition.findMany({
      include: CLASS_DEFINITION_INCLUDE,
      orderBy: { name: 'asc' },
    });
  }

  async createClassDefinition(body: {
    name?: string;
    subclassChoiceLevel?: unknown;
    casterProgression?: unknown;
  }) {
    const name = String(body?.name ?? '').trim();
    if (!name) throw new BadRequestException('class name required');
    return this.prisma.characterClassDefinition.create({
      data: {
        name,
        subclassChoiceLevel: normalizeOptionalPositiveInt(
          body.subclassChoiceLevel,
        ),
        casterProgression: normalizeCasterProgression(body.casterProgression),
      },
      include: CLASS_DEFINITION_INCLUDE,
    });
  }

  async updateClassDefinition(
    classDefinitionId: string,
    body: {
      name?: string;
      subclassChoiceLevel?: unknown;
      casterProgression?: unknown;
    },
  ) {
    const id = this.normalizeId(classDefinitionId, 'classDefinitionId');
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) {
      const name = String(body.name ?? '').trim();
      if (!name) throw new BadRequestException('class name required');
      data.name = name;
    }
    if (body.subclassChoiceLevel !== undefined) {
      data.subclassChoiceLevel = normalizeOptionalPositiveInt(
        body.subclassChoiceLevel,
      );
    }
    if (body.casterProgression !== undefined) {
      data.casterProgression = normalizeCasterProgression(
        body.casterProgression,
      );
    }
    return this.prisma.characterClassDefinition.update({
      where: { id },
      data,
      include: CLASS_DEFINITION_INCLUDE,
    });
  }

  async deleteClassDefinition(classDefinitionId: string) {
    const id = this.normalizeId(classDefinitionId, 'classDefinitionId');
    const [subclassCount, characterClassCount] = await Promise.all([
      this.prisma.characterSubclassDefinition.count({
        where: { classDefinitionId: id },
      }),
      this.prisma.characterClass.count({ where: { classDefinitionId: id } }),
    ]);
    if (subclassCount || characterClassCount) {
      throw new BadRequestException('class definition is in use');
    }
    await this.prisma.characterClassDefinition.delete({ where: { id } });
    return { ok: true };
  }

  async createSubclassDefinition(
    classDefinitionId: string,
    body: { name?: string },
  ) {
    const id = this.normalizeId(classDefinitionId, 'classDefinitionId');
    const name = String(body?.name ?? '').trim();
    if (!name) throw new BadRequestException('subclass name required');
    await this.assertClassDefinitionExists(id);
    return this.prisma.characterSubclassDefinition.create({
      data: { classDefinitionId: id, name },
    });
  }

  async updateSubclassDefinition(
    subclassDefinitionId: string,
    body: { name?: string },
  ) {
    const id = this.normalizeId(subclassDefinitionId, 'subclassDefinitionId');
    const name = String(body?.name ?? '').trim();
    if (!name) throw new BadRequestException('subclass name required');
    return this.prisma.characterSubclassDefinition.update({
      where: { id },
      data: { name },
    });
  }

  async deleteSubclassDefinition(subclassDefinitionId: string) {
    const id = this.normalizeId(subclassDefinitionId, 'subclassDefinitionId');
    const characterClassCount = await this.prisma.characterClass.count({
      where: { subclassDefinitionId: id },
    });
    if (characterClassCount) {
      throw new BadRequestException('subclass definition is in use');
    }
    await this.prisma.characterSubclassDefinition.delete({ where: { id } });
    return { ok: true };
  }

  async createClassBranchGroup(
    classDefinitionId: string,
    body: BranchGroupPatch,
  ) {
    const id = this.normalizeId(classDefinitionId, 'classDefinitionId');
    await this.assertClassDefinitionExists(id);
    const data = this.normalizeBranchGroupPatch(body, true);
    return this.prisma.progressionBranchGroup.create({
      data: {
        classDefinitionId: id,
        ...data,
      } as any,
      include: BRANCH_GROUP_INCLUDE,
    });
  }

  async createSubclassBranchGroup(
    subclassDefinitionId: string,
    body: BranchGroupPatch,
  ) {
    const id = this.normalizeId(subclassDefinitionId, 'subclassDefinitionId');
    const subclass = await this.prisma.characterSubclassDefinition.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!subclass) throw new NotFoundException('subclass definition not found');
    const data = this.normalizeBranchGroupPatch(body, true);
    return this.prisma.progressionBranchGroup.create({
      data: {
        subclassDefinitionId: id,
        ...data,
      } as any,
      include: BRANCH_GROUP_INCLUDE,
    });
  }

  async updateBranchGroup(branchGroupId: string, body: BranchGroupPatch) {
    const id = this.normalizeId(branchGroupId, 'branchGroupId');
    const current = await this.prisma.progressionBranchGroup.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!current) throw new NotFoundException('branch group not found');
    const data = this.normalizeBranchGroupPatch(body, false);
    return this.prisma.progressionBranchGroup.update({
      where: { id },
      data,
      include: BRANCH_GROUP_INCLUDE,
    });
  }

  async deleteBranchGroup(branchGroupId: string) {
    const id = this.normalizeId(branchGroupId, 'branchGroupId');
    const current = await this.prisma.progressionBranchGroup.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!current) throw new NotFoundException('branch group not found');
    await this.prisma.progressionBranchGroup.delete({ where: { id } });
    return { ok: true };
  }

  async createBranchOption(branchGroupId: string, body: BranchOptionPatch) {
    const id = this.normalizeId(branchGroupId, 'branchGroupId');
    const group = await this.prisma.progressionBranchGroup.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!group) throw new NotFoundException('branch group not found');
    const data = this.normalizeBranchOptionPatch(body, true);
    return this.prisma.progressionBranchOption.create({
      data: {
        branchGroupId: id,
        ...data,
      } as any,
    });
  }

  async updateBranchOption(branchOptionId: string, body: BranchOptionPatch) {
    const id = this.normalizeId(branchOptionId, 'branchOptionId');
    const current = await this.prisma.progressionBranchOption.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!current) throw new NotFoundException('branch option not found');
    const data = this.normalizeBranchOptionPatch(body, false);
    return this.prisma.progressionBranchOption.update({
      where: { id },
      data,
    });
  }

  async deleteBranchOption(branchOptionId: string) {
    const id = this.normalizeId(branchOptionId, 'branchOptionId');
    const current = await this.prisma.progressionBranchOption.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!current) throw new NotFoundException('branch option not found');
    await this.prisma.progressionBranchOption.delete({ where: { id } });
    return { ok: true };
  }

  async createClassFeatureDefinition(
    classDefinitionId: string,
    body: ClassFeaturePatch,
  ) {
    const id = this.normalizeId(classDefinitionId, 'classDefinitionId');
    await this.assertClassDefinitionExists(id);
    const data = this.normalizeClassFeaturePatch(body, true);
    this.validateClassFeatureText(data);
    await this.validateClassFeatureReference(data);
    await this.validateBranchOptionForOwner(data.branchOptionId, {
      classDefinitionId: id,
    });
    return this.prisma.characterClassFeatureDefinition.create({
      data: {
        classDefinitionId: id,
        ...data,
      } as any,
    });
  }

  async createSubclassFeatureDefinition(
    subclassDefinitionId: string,
    body: ClassFeaturePatch,
  ) {
    const id = this.normalizeId(subclassDefinitionId, 'subclassDefinitionId');
    const subclass = await this.prisma.characterSubclassDefinition.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!subclass) throw new NotFoundException('subclass definition not found');
    const data = this.normalizeClassFeaturePatch(body, true);
    this.validateClassFeatureText(data);
    await this.validateClassFeatureReference(data);
    await this.validateBranchOptionForOwner(data.branchOptionId, {
      subclassDefinitionId: id,
    });
    return this.prisma.characterClassFeatureDefinition.create({
      data: {
        subclassDefinitionId: id,
        ...data,
      } as any,
    });
  }

  async updateClassFeatureDefinition(
    classFeatureDefinitionId: string,
    body: ClassFeaturePatch,
  ) {
    const id = this.normalizeId(
      classFeatureDefinitionId,
      'classFeatureDefinitionId',
    );
    const current =
      await this.prisma.characterClassFeatureDefinition.findUnique({
        where: { id },
        select: {
          id: true,
          target: true,
          name: true,
          description: true,
          skillEntryId: true,
          spellEntryId: true,
          classDefinitionId: true,
          subclassDefinitionId: true,
          branchOptionId: true,
          defaultSheetVisible: true,
        },
      });
    if (!current)
      throw new NotFoundException('class feature definition not found');
    const data = this.normalizeClassFeaturePatch(body, false, current);
    this.validateClassFeatureText({
      target: data.target ?? current.target,
      name: data.name !== undefined ? data.name : current.name,
      description:
        data.description !== undefined ? data.description : current.description,
    });
    await this.validateClassFeatureReference({
      target: data.target ?? current.target,
      skillEntryId:
        data.skillEntryId !== undefined
          ? data.skillEntryId
          : current.skillEntryId,
      spellEntryId:
        data.spellEntryId !== undefined
          ? data.spellEntryId
          : current.spellEntryId,
    });
    await this.validateBranchOptionForOwner(
      data.branchOptionId !== undefined
        ? data.branchOptionId
        : current.branchOptionId,
      {
        classDefinitionId: current.classDefinitionId,
        subclassDefinitionId: current.subclassDefinitionId,
      },
    );
    return this.prisma.characterClassFeatureDefinition.update({
      where: { id },
      data,
    });
  }

  async deleteClassFeatureDefinition(classFeatureDefinitionId: string) {
    const id = this.normalizeId(
      classFeatureDefinitionId,
      'classFeatureDefinitionId',
    );
    const current =
      await this.prisma.characterClassFeatureDefinition.findUnique({
        where: { id },
        select: { id: true },
      });
    if (!current)
      throw new NotFoundException('class feature definition not found');
    await this.prisma.characterClassFeatureDefinition.delete({ where: { id } });
    return { ok: true };
  }

  async createClassChoiceGroup(
    classDefinitionId: string,
    body: ChoiceGroupPatch,
  ) {
    const id = this.normalizeId(classDefinitionId, 'classDefinitionId');
    await this.assertClassDefinitionExists(id);
    const data = this.normalizeChoiceGroupPatch(body, true);
    await this.validateBranchOptionForOwner(data.branchOptionId, {
      classDefinitionId: id,
    });
    return this.prisma.characterClassChoiceGroup.create({
      data: {
        classDefinitionId: id,
        ...data,
      } as any,
      include: CHOICE_GROUP_INCLUDE,
    });
  }

  async createSubclassChoiceGroup(
    subclassDefinitionId: string,
    body: ChoiceGroupPatch,
  ) {
    const id = this.normalizeId(subclassDefinitionId, 'subclassDefinitionId');
    const subclass = await this.prisma.characterSubclassDefinition.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!subclass) throw new NotFoundException('subclass definition not found');
    const data = this.normalizeChoiceGroupPatch(body, true);
    await this.validateBranchOptionForOwner(data.branchOptionId, {
      subclassDefinitionId: id,
    });
    return this.prisma.characterClassChoiceGroup.create({
      data: {
        subclassDefinitionId: id,
        ...data,
      } as any,
      include: CHOICE_GROUP_INCLUDE,
    });
  }

  async updateChoiceGroup(choiceGroupId: string, body: ChoiceGroupPatch) {
    const id = this.normalizeId(choiceGroupId, 'choiceGroupId');
    const current = await this.prisma.characterClassChoiceGroup.findUnique({
      where: { id },
      select: {
        id: true,
        classDefinitionId: true,
        subclassDefinitionId: true,
        branchOptionId: true,
      },
    });
    if (!current) throw new NotFoundException('choice group not found');
    const data = this.normalizeChoiceGroupPatch(body, false);
    await this.validateBranchOptionForOwner(
      data.branchOptionId !== undefined
        ? data.branchOptionId
        : current.branchOptionId,
      {
        classDefinitionId: current.classDefinitionId,
        subclassDefinitionId: current.subclassDefinitionId,
      },
    );
    return this.prisma.characterClassChoiceGroup.update({
      where: { id },
      data,
      include: CHOICE_GROUP_INCLUDE,
    });
  }

  async deleteChoiceGroup(choiceGroupId: string) {
    const id = this.normalizeId(choiceGroupId, 'choiceGroupId');
    const current = await this.prisma.characterClassChoiceGroup.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!current) throw new NotFoundException('choice group not found');
    await this.prisma.characterClassChoiceGroup.delete({ where: { id } });
    return { ok: true };
  }

  async createChoiceOption(choiceGroupId: string, body: ChoiceOptionPatch) {
    const id = this.normalizeId(choiceGroupId, 'choiceGroupId');
    const group = await this.prisma.characterClassChoiceGroup.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!group) throw new NotFoundException('choice group not found');
    const data = this.normalizeChoiceOptionPatch(body, true);
    this.validateChoiceOptionText(data);
    await this.validateChoiceOptionReference(data);
    return this.prisma.characterClassChoiceOption.create({
      data: {
        choiceGroupId: id,
        ...data,
      } as any,
      include: CHOICE_OPTION_INCLUDE,
    });
  }

  async updateChoiceOption(choiceOptionId: string, body: ChoiceOptionPatch) {
    const id = this.normalizeId(choiceOptionId, 'choiceOptionId');
    const current = await this.prisma.characterClassChoiceOption.findUnique({
      where: { id },
      select: {
        id: true,
        target: true,
        name: true,
        description: true,
        skillEntryId: true,
        spellEntryId: true,
        defaultSheetVisible: true,
      },
    });
    if (!current) throw new NotFoundException('choice option not found');
    const data = this.normalizeChoiceOptionPatch(body, false, current);
    this.validateChoiceOptionText({
      target: data.target ?? current.target,
      name: data.name !== undefined ? data.name : current.name,
      description:
        data.description !== undefined ? data.description : current.description,
    });
    await this.validateChoiceOptionReference({
      target: data.target ?? current.target,
      skillEntryId:
        data.skillEntryId !== undefined
          ? data.skillEntryId
          : current.skillEntryId,
      spellEntryId:
        data.spellEntryId !== undefined
          ? data.spellEntryId
          : current.spellEntryId,
    });
    return this.prisma.characterClassChoiceOption.update({
      where: { id },
      data,
      include: CHOICE_OPTION_INCLUDE,
    });
  }

  async deleteChoiceOption(choiceOptionId: string) {
    const id = this.normalizeId(choiceOptionId, 'choiceOptionId');
    const current = await this.prisma.characterClassChoiceOption.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!current) throw new NotFoundException('choice option not found');
    const selectedCount = await this.prisma.characterClassChoiceSelection.count(
      {
        where: { choiceOptionId: id },
      },
    );
    if (selectedCount) {
      throw new BadRequestException('choice option is selected by characters');
    }
    await this.prisma.characterClassChoiceOption.delete({ where: { id } });
    return { ok: true };
  }

  async createClassFeatureAdditionalReward(
    classFeatureDefinitionId: string,
    body: AdditionalRewardPatch,
  ) {
    const id = this.normalizeId(
      classFeatureDefinitionId,
      'classFeatureDefinitionId',
    );
    const parent = await this.prisma.characterClassFeatureDefinition.findUnique(
      {
        where: { id },
        select: { id: true },
      },
    );
    if (!parent)
      throw new NotFoundException('class feature definition not found');
    const data = await this.normalizeAdditionalRewardPatch(body, true);
    return this.prisma.characterClassAdditionalReward.create({
      data: {
        featureDefinitionId: id,
        ...data,
      } as any,
      include: ADDITIONAL_REWARD_INCLUDE,
    });
  }

  async createChoiceOptionAdditionalReward(
    choiceOptionId: string,
    body: AdditionalRewardPatch,
  ) {
    const id = this.normalizeId(choiceOptionId, 'choiceOptionId');
    const parent = await this.prisma.characterClassChoiceOption.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!parent) throw new NotFoundException('choice option not found');
    const data = await this.normalizeAdditionalRewardPatch(body, true);
    return this.prisma.characterClassAdditionalReward.create({
      data: {
        choiceOptionId: id,
        ...data,
      } as any,
      include: ADDITIONAL_REWARD_INCLUDE,
    });
  }

  async updateAdditionalReward(
    additionalRewardId: string,
    body: AdditionalRewardPatch,
  ) {
    const id = this.normalizeId(additionalRewardId, 'additionalRewardId');
    const current = await this.prisma.characterClassAdditionalReward.findUnique(
      {
        where: { id },
      },
    );
    if (!current) throw new NotFoundException('additional reward not found');
    const data = await this.normalizeAdditionalRewardPatch(
      body,
      false,
      current,
    );
    return this.prisma.characterClassAdditionalReward.update({
      where: { id },
      data,
      include: ADDITIONAL_REWARD_INCLUDE,
    });
  }

  async deleteAdditionalReward(additionalRewardId: string) {
    const id = this.normalizeId(additionalRewardId, 'additionalRewardId');
    const current = await this.prisma.characterClassAdditionalReward.findUnique(
      {
        where: { id },
        select: { id: true },
      },
    );
    if (!current) throw new NotFoundException('additional reward not found');
    await this.prisma.characterClassAdditionalReward.delete({ where: { id } });
    return { ok: true };
  }

  async createFeatureUpgrade(body: FeatureUpgradePatch) {
    const data = await this.normalizeFeatureUpgradePatch(body, true);
    await this.assertFeatureUpgradeNotDuplicate(data);
    return this.prisma.characterClassFeatureUpgrade.create({
      data: data as any,
      include: FEATURE_UPGRADES_INCLUDE_ORDERED.include,
    });
  }

  async updateFeatureUpgrade(upgradeId: string, body: FeatureUpgradePatch) {
    const id = this.normalizeId(upgradeId, 'upgradeId');
    const current = await this.prisma.characterClassFeatureUpgrade.findUnique({
      where: { id },
    });
    if (!current) throw new NotFoundException('feature upgrade not found');
    const data = await this.normalizeFeatureUpgradePatch(body, false, current);
    const merged = { ...current, ...data };
    await this.assertFeatureUpgradeNotDuplicate(merged, id);
    return this.prisma.characterClassFeatureUpgrade.update({
      where: { id },
      data,
      include: FEATURE_UPGRADES_INCLUDE_ORDERED.include,
    });
  }

  async deleteFeatureUpgrade(upgradeId: string) {
    const id = this.normalizeId(upgradeId, 'upgradeId');
    const current = await this.prisma.characterClassFeatureUpgrade.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!current) throw new NotFoundException('feature upgrade not found');
    await this.prisma.characterClassFeatureUpgrade.delete({ where: { id } });
    return { ok: true };
  }

  async updateCharacterFeatureOverride(
    characterName: string,
    body: FeatureOverridePatch,
  ) {
    const name = this.normalizeCharacterName(characterName);
    await this.ensureCharacterSheet(name);
    const data = await this.normalizeFeatureOverridePatch(body);
    const current = await this.prisma.characterFeatureOverride.findFirst({
      where: {
        characterSheetId: name,
        ...(data.targetFeatureDefinitionId
          ? { targetFeatureDefinitionId: data.targetFeatureDefinitionId }
          : { targetChoiceOptionId: data.targetChoiceOptionId }),
      },
      select: { id: true },
    });
    const isDefaultRow =
      data.visibility === 'DEFAULT' && !data.suppressed && !data.note;
    if (isDefaultRow) {
      if (current) {
        await this.prisma.characterFeatureOverride.delete({
          where: { id: current.id },
        });
      }
      return { ok: true, override: null };
    }
    const payload = {
      characterSheetId: name,
      ...data,
    };
    const override = current
      ? await this.prisma.characterFeatureOverride.update({
          where: { id: current.id },
          data: data as any,
        })
      : await this.prisma.characterFeatureOverride.create({
          data: payload as any,
        });
    return { ok: true, override };
  }

  async createCharacterClass(characterName: string, body: CharacterClassPatch) {
    const name = this.normalizeCharacterName(characterName);
    const classDefinitionId = this.normalizeId(
      body.classDefinitionId,
      'classDefinitionId',
    );
    const level = positiveInt(body.level);
    const subclassDefinitionId = textOrNull(body.subclassDefinitionId) ?? null;
    await this.validateSubclassForClass(
      classDefinitionId,
      subclassDefinitionId,
    );
    const sheet = await this.ensureCharacterSheet(name);
    await this.assertCharacterClassNotDuplicate(sheet.id, classDefinitionId);
    return this.prisma.characterClass.create({
      data: {
        characterSheetId: sheet.id,
        classDefinitionId,
        subclassDefinitionId,
        level,
      },
      include: CHARACTER_CLASS_INCLUDE,
    });
  }

  async updateCharacterClass(
    characterName: string,
    characterClassId: string,
    body: CharacterClassPatch,
  ) {
    const name = this.normalizeCharacterName(characterName);
    const id = this.normalizeId(characterClassId, 'characterClassId');
    const current = await this.findCharacterClassForCharacter(name, id);
    const classDefinitionId =
      body.classDefinitionId !== undefined
        ? this.normalizeId(body.classDefinitionId, 'classDefinitionId')
        : current.classDefinitionId;
    const subclassDefinitionId =
      body.subclassDefinitionId !== undefined
        ? (textOrNull(body.subclassDefinitionId) ?? null)
        : current.subclassDefinitionId;
    await this.validateSubclassForClass(
      classDefinitionId,
      subclassDefinitionId,
    );
    await this.assertCharacterClassNotDuplicate(
      current.characterSheetId,
      classDefinitionId,
      current.id,
    );

    const data: Record<string, unknown> = {
      classDefinitionId,
      subclassDefinitionId,
    };
    if (body.level !== undefined) data.level = positiveInt(body.level);

    return this.prisma.characterClass.update({
      where: { id },
      data,
      include: CHARACTER_CLASS_INCLUDE,
    });
  }

  async deleteCharacterClass(characterName: string, characterClassId: string) {
    const name = this.normalizeCharacterName(characterName);
    const id = this.normalizeId(characterClassId, 'characterClassId');
    await this.findCharacterClassForCharacter(name, id);
    await this.prisma.characterClass.delete({ where: { id } });
    return { ok: true };
  }

  async setCharacterClassChoiceSelections(
    characterName: string,
    characterClassId: string,
    choiceGroupId: string,
    body: ChoiceSelectionPatch,
  ) {
    const name = this.normalizeCharacterName(characterName);
    const classId = this.normalizeId(characterClassId, 'characterClassId');
    const groupId = this.normalizeId(choiceGroupId, 'choiceGroupId');
    const characterClass = await this.findCharacterClassForCharacter(
      name,
      classId,
    );
    const group = await this.prisma.characterClassChoiceGroup.findUnique({
      where: { id: groupId },
      include: {
        branchOption: true,
        options: {
          select: { id: true },
        },
      },
    });
    if (!group) throw new NotFoundException('choice group not found');
    this.validateChoiceGroupForCharacterClass(characterClass, group);
    if (positiveInt(characterClass.level) < positiveInt(group.level)) {
      throw new BadRequestException('choice group level is not reached');
    }
    if (group.branchOptionId) {
      const active = await this.isBranchOptionActiveForCharacterClass(
        characterClass,
        group.branchOptionId,
      );
      if (!active) {
        throw new BadRequestException('choice group branch is not active');
      }
    }

    const rawOptionIds = Array.isArray(body.choiceOptionIds)
      ? body.choiceOptionIds
      : [];
    const choiceOptionIds = [
      ...new Set(
        rawOptionIds.map((value) => this.normalizeId(value, 'choiceOptionId')),
      ),
    ];
    const allowedOptionIds = new Set(group.options.map((option) => option.id));
    for (const optionId of choiceOptionIds) {
      if (!allowedOptionIds.has(optionId)) {
        throw new BadRequestException('choice option does not belong to group');
      }
    }
    if (choiceOptionIds.length > group.selectionCount) {
      throw new BadRequestException('choice selection count exceeded');
    }

    await this.prisma.$transaction([
      this.prisma.characterClassChoiceSelection.deleteMany({
        where: { characterClassId: classId, choiceGroupId: groupId },
      }),
      ...choiceOptionIds.map((optionId) =>
        this.prisma.characterClassChoiceSelection.create({
          data: {
            characterClassId: classId,
            choiceGroupId: groupId,
            choiceOptionId: optionId,
          },
        }),
      ),
    ]);

    return this.prisma.characterClass.findUnique({
      where: { id: classId },
      include: CHARACTER_CLASS_INCLUDE,
    });
  }

  async setCharacterClassBranchSelection(
    characterName: string,
    characterClassId: string,
    branchGroupId: string,
    body: BranchSelectionPatch,
  ) {
    const name = this.normalizeCharacterName(characterName);
    const classId = this.normalizeId(characterClassId, 'characterClassId');
    const groupId = this.normalizeId(branchGroupId, 'branchGroupId');
    const characterClass = await this.findCharacterClassForCharacter(
      name,
      classId,
    );
    const branchOptionId = textOrNull(body.branchOptionId);

    if (!branchOptionId) {
      await this.prisma.characterClassBranchSelection.deleteMany({
        where: { characterClassId: classId, branchGroupId: groupId },
      });
      return this.prisma.characterClass.findUnique({
        where: { id: classId },
        include: CHARACTER_CLASS_INCLUDE,
      });
    }

    const group = await this.prisma.progressionBranchGroup.findUnique({
      where: { id: groupId },
      include: {
        options: { select: { id: true } },
      },
    });
    if (!group) throw new NotFoundException('branch group not found');
    this.validateBranchGroupForCharacterClass(characterClass, group);
    if (positiveInt(characterClass.level) < positiveInt(group.unlockLevel)) {
      throw new BadRequestException('branch group level is not reached');
    }
    if (!group.options.some((option) => option.id === branchOptionId)) {
      throw new BadRequestException('branch option does not belong to group');
    }

    await this.prisma.characterClassBranchSelection.upsert({
      where: {
        characterClassId_branchGroupId: {
          characterClassId: classId,
          branchGroupId: groupId,
        },
      },
      update: { branchOptionId },
      create: {
        characterClassId: classId,
        branchGroupId: groupId,
        branchOptionId,
      },
    });

    return this.prisma.characterClass.findUnique({
      where: { id: classId },
      include: CHARACTER_CLASS_INCLUDE,
    });
  }

  async upsertItemProfile(body: {
    itemName?: string;
    allowedSlots?: unknown;
    occupiesSlots?: unknown;
    effects?: unknown;
    flavorText?: string | null;
    metadata?: string | null;
    notes?: string | null;
  }) {
    const itemName = String(body?.itemName ?? '').trim();
    if (!itemName) throw new BadRequestException('itemName required');

    const item = await this.prisma.itemsInfo.findUnique({
      where: { name: itemName },
      select: { name: true },
    });
    if (!item) throw new NotFoundException(`Item "${itemName}" not found`);

    const allowedSlots = normalizeSlots(body.allowedSlots);
    const occupiesSlots = normalizeOccupancySlots(body.occupiesSlots);
    if (!allowedSlots.length) {
      throw new BadRequestException('allowedSlots required');
    }
    const effectiveOccupiesSlots = occupiesSlots.length
      ? occupiesSlots
      : DEFAULT_OCCUPIES_SLOTS;
    const effects =
      body.effects === undefined
        ? undefined
        : normalizeItemProfileEffects(body.effects);

    return this.prisma.$transaction(async (tx) => {
      const profile = await tx.itemEquipmentProfile.upsert({
        where: { itemName },
        update: {
          allowedSlots,
          occupiesSlots: effectiveOccupiesSlots,
          flavorText: textOrNull(body.flavorText),
          metadata: textOrNull(body.metadata),
          notes: textOrNull(body.notes),
        },
        create: {
          itemName,
          allowedSlots,
          occupiesSlots: effectiveOccupiesSlots,
          flavorText: textOrNull(body.flavorText),
          metadata: textOrNull(body.metadata),
          notes: textOrNull(body.notes),
        },
      });

      if (effects !== undefined) {
        await tx.itemEquipmentProfileEffect.deleteMany({
          where: { profileId: profile.id },
        });
        if (effects.length) {
          await tx.itemEquipmentProfileEffect.createMany({
            data: effects.map((effect) => ({
              profileId: profile.id,
              name: effect.name,
              description: effect.description,
              order: effect.order,
            })),
          });
        }
      }

      const next = await tx.itemEquipmentProfile.findUniqueOrThrow({
        where: { id: profile.id },
        include: ITEM_PROFILE_INCLUDE,
      });
      return normalizeItemProfile(next);
    });
  }

  async equipItem(
    characterName: string,
    body: { itemName?: string; slotKey?: string },
  ) {
    const name = this.normalizeCharacterName(characterName);
    const itemName = String(body?.itemName ?? '').trim();
    const slotKey = String(body?.slotKey ?? '').trim();
    if (!itemName) throw new BadRequestException('itemName required');
    const selectedSlot = normalizeSlotKey(slotKey);
    if (!selectedSlot) throw new BadRequestException('invalid slotKey');

    await this.assertCharacterExists(name);

    const [profile, inventory] = await Promise.all([
      this.prisma.itemEquipmentProfile.findUnique({ where: { itemName } }),
      this.prisma.inventory.findUnique({
        where: { owner_itemName: { owner: name, itemName } },
      }),
    ]);
    if (!profile) {
      throw new BadRequestException('item equipment profile required');
    }
    if (!inventory || inventory.amount <= 0) {
      throw new BadRequestException('character does not own this item');
    }

    const allowedSlots = normalizeSlots(profile.allowedSlots);
    if (!allowedSlots.includes(selectedSlot)) {
      throw new BadRequestException('item cannot be equipped in this slot');
    }
    const occupiesSlots = normalizeOccupancySlots(profile.occupiesSlots);
    const slots = occupiesSlots.length
      ? resolveOccupiedSlots(occupiesSlots, selectedSlot)
      : [selectedSlot];

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.characterEquipment.findMany({
        where: { characterName: name },
      });
      const overlappingIds = existing
        .filter((entry) => hasSlotOverlap(normalizeSlots(entry.slots), slots))
        .map((entry) => entry.id);
      const sameItemAfterReplacement =
        existing.filter(
          (entry) =>
            entry.itemName === itemName && !overlappingIds.includes(entry.id),
        ).length + 1;

      const ringCountAfterReplacement =
        existing.filter(
          (entry) =>
            !overlappingIds.includes(entry.id) &&
            normalizeSlots(entry.slots).includes('반지'),
        ).length + (slots.includes('반지') ? 1 : 0);

      if (ringCountAfterReplacement > RING_SLOT_LIMIT) {
        throw new BadRequestException('ring slot limit exceeded');
      }

      if (inventory.amount < sameItemAfterReplacement) {
        throw new BadRequestException(
          'not enough item amount to equip another copy',
        );
      }

      if (overlappingIds.length) {
        await tx.characterEquipment.deleteMany({
          where: { id: { in: overlappingIds } },
        });
      }

      return tx.characterEquipment.create({
        data: {
          characterName: name,
          itemName,
          slots,
          equipGroupId: randomUUID(),
        },
      });
    });
  }

  async unequipItem(characterName: string, equipmentId: string) {
    const name = this.normalizeCharacterName(characterName);
    const id = String(equipmentId ?? '').trim();
    if (!id) throw new BadRequestException('equipmentId required');

    const row = await this.prisma.characterEquipment.findFirst({
      where: { id, characterName: name },
    });
    if (!row) throw new NotFoundException('equipment not found');

    await this.prisma.characterEquipment.delete({ where: { id } });
    return { ok: true };
  }

  async createFeature(characterName: string, body: FeaturePatch) {
    const name = this.normalizeCharacterName(characterName);
    await this.assertCharacterExists(name);

    const featureName = String(body?.name ?? '').trim();
    if (!featureName) throw new BadRequestException('feature name required');

    return this.prisma.characterFeature.create({
      data: {
        characterName: name,
        kind: normalizeFeatureKind(body.kind),
        name: featureName,
        description: String(body?.description ?? '').trim(),
        order: intOrNull(body.order) ?? 0,
      },
    });
  }

  async updateFeature(
    characterName: string,
    featureId: string,
    body: FeaturePatch,
  ) {
    const name = this.normalizeCharacterName(characterName);
    const id = String(featureId ?? '').trim();
    if (!id) throw new BadRequestException('featureId required');

    const current = await this.prisma.characterFeature.findFirst({
      where: { id, characterName: name },
    });
    if (!current) throw new NotFoundException('feature not found');

    const data: Record<string, unknown> = {};
    if (body.kind !== undefined) data.kind = normalizeFeatureKind(body.kind);
    if (body.name !== undefined) {
      const featureName = String(body.name ?? '').trim();
      if (!featureName) throw new BadRequestException('feature name required');
      data.name = featureName;
    }
    if (body.description !== undefined) {
      data.description = String(body.description ?? '').trim();
    }
    if (body.order !== undefined) data.order = intOrNull(body.order) ?? 0;

    return this.prisma.characterFeature.update({
      where: { id },
      data,
    });
  }

  async deleteFeature(characterName: string, featureId: string) {
    const name = this.normalizeCharacterName(characterName);
    const id = String(featureId ?? '').trim();
    if (!id) throw new BadRequestException('featureId required');

    const current = await this.prisma.characterFeature.findFirst({
      where: { id, characterName: name },
      select: { id: true },
    });
    if (!current) throw new NotFoundException('feature not found');

    await this.prisma.characterFeature.delete({ where: { id } });
    return { ok: true };
  }

  private normalizeCharacterName(value: string) {
    const name = String(value ?? '').trim();
    if (!name) throw new BadRequestException('character name required');
    return name;
  }

  private normalizeId(value: unknown, label: string) {
    const id = String(value ?? '').trim();
    if (!id) throw new BadRequestException(`${label} required`);
    return id;
  }

  private async assertCharacterExists(name: string) {
    const character = await this.prisma.characterGold.findUnique({
      where: { name },
      select: { name: true },
    });
    if (!character)
      throw new NotFoundException(`Character "${name}" not found`);
  }

  private async ensureCharacterSheet(name: string) {
    await this.assertCharacterExists(name);
    return this.prisma.characterSheet.upsert({
      where: { characterName: name },
      update: {},
      create: { characterName: name },
    });
  }

  private async assertClassDefinitionExists(classDefinitionId: string) {
    const row = await this.prisma.characterClassDefinition.findUnique({
      where: { id: classDefinitionId },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('class definition not found');
  }

  private async validateSubclassForClass(
    classDefinitionId: string,
    subclassDefinitionId: string | null,
  ) {
    await this.assertClassDefinitionExists(classDefinitionId);
    if (!subclassDefinitionId) return;
    const subclass = await this.prisma.characterSubclassDefinition.findUnique({
      where: { id: subclassDefinitionId },
      select: { classDefinitionId: true },
    });
    if (!subclass) throw new NotFoundException('subclass definition not found');
    if (subclass.classDefinitionId !== classDefinitionId) {
      throw new BadRequestException('subclass does not belong to class');
    }
  }

  private async findCharacterClassForCharacter(
    characterName: string,
    characterClassId: string,
  ) {
    const current = await this.prisma.characterClass.findFirst({
      where: {
        id: characterClassId,
        characterSheet: { characterName },
      },
    });
    if (!current) throw new NotFoundException('character class not found');
    return current;
  }

  private async assertCharacterClassNotDuplicate(
    characterSheetId: string,
    classDefinitionId: string,
    exceptId?: string,
  ) {
    const duplicate = await this.prisma.characterClass.findFirst({
      where: {
        characterSheetId,
        classDefinitionId,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new BadRequestException('character already has this class');
    }
  }

  private normalizeBranchGroupPatch(
    patch: BranchGroupPatch,
    requireAll: boolean,
  ) {
    const data: Record<string, unknown> = {};
    if (patch.name !== undefined || requireAll) {
      data.name = requiredText(patch.name, 'branch group name');
    }
    if (patch.description !== undefined || requireAll) {
      data.description = String(patch.description ?? '').trim();
    }
    if (patch.unlockLevel !== undefined || requireAll) {
      data.unlockLevel = positiveInt(patch.unlockLevel);
    }
    if (patch.displayOrder !== undefined || requireAll) {
      data.displayOrder = intOrNull(patch.displayOrder) ?? 0;
    }
    return data;
  }

  private normalizeBranchOptionPatch(
    patch: BranchOptionPatch,
    requireAll: boolean,
  ) {
    const data: Record<string, unknown> = {};
    if (patch.name !== undefined || requireAll) {
      data.name = requiredText(patch.name, 'branch option name');
    }
    if (patch.description !== undefined || requireAll) {
      data.description = String(patch.description ?? '').trim();
    }
    if (patch.displayOrder !== undefined || requireAll) {
      data.displayOrder = intOrNull(patch.displayOrder) ?? 0;
    }
    return data;
  }

  private async validateBranchOptionForOwner(
    branchOptionId: unknown,
    owner: {
      classDefinitionId?: string | null;
      subclassDefinitionId?: string | null;
    },
  ) {
    const id = textOrNull(branchOptionId);
    if (!id) return;
    const option = await this.prisma.progressionBranchOption.findUnique({
      where: { id },
      include: {
        branchGroup: {
          select: {
            classDefinitionId: true,
            subclassDefinitionId: true,
          },
        },
      },
    });
    if (!option) throw new NotFoundException('branch option not found');
    if (
      owner.classDefinitionId &&
      option.branchGroup.classDefinitionId === owner.classDefinitionId
    ) {
      return;
    }
    if (
      owner.subclassDefinitionId &&
      option.branchGroup.subclassDefinitionId === owner.subclassDefinitionId
    ) {
      return;
    }
    throw new BadRequestException('branch option does not belong to owner');
  }

  private validateBranchGroupForCharacterClass(
    characterClass: any,
    group: any,
  ) {
    if (group.classDefinitionId) {
      if (group.classDefinitionId !== characterClass.classDefinitionId) {
        throw new BadRequestException('branch group does not belong to class');
      }
      return;
    }
    if (group.subclassDefinitionId) {
      if (group.subclassDefinitionId !== characterClass.subclassDefinitionId) {
        throw new BadRequestException(
          'branch group does not belong to subclass',
        );
      }
      return;
    }
    throw new BadRequestException('branch group has no owner');
  }

  private async isBranchOptionActiveForCharacterClass(
    characterClass: any,
    branchOptionId: string,
  ) {
    const option = await this.prisma.progressionBranchOption.findUnique({
      where: { id: branchOptionId },
      include: { branchGroup: true },
    });
    if (!option) return false;
    this.validateBranchGroupForCharacterClass(
      characterClass,
      option.branchGroup,
    );
    if (
      positiveInt(characterClass.level) <
      positiveInt(option.branchGroup.unlockLevel)
    ) {
      return false;
    }
    const selection =
      await this.prisma.characterClassBranchSelection.findUnique({
        where: {
          characterClassId_branchGroupId: {
            characterClassId: characterClass.id,
            branchGroupId: option.branchGroupId,
          },
        },
        select: { branchOptionId: true },
      });
    return selection?.branchOptionId === branchOptionId;
  }

  private normalizeClassFeaturePatch(
    patch: ClassFeaturePatch,
    requireAll: boolean,
    current?: {
      target?: CharacterClassFeatureTargetValue | string | null;
      skillEntryId?: number | null;
      spellEntryId?: number | null;
      defaultSheetVisible?: boolean | null;
    },
  ) {
    const data: Record<string, unknown> = {};
    if (patch.level !== undefined || requireAll) {
      data.level = positiveInt(patch.level);
    }
    if (patch.target !== undefined || requireAll) {
      data.target = normalizeClassFeatureTarget(patch.target);
    }
    if (patch.order !== undefined || requireAll) {
      data.order = intOrNull(patch.order) ?? 0;
    }
    if (patch.branchOptionId !== undefined || requireAll) {
      data.branchOptionId = textOrNull(patch.branchOptionId);
    }
    if (patch.defaultSheetVisible !== undefined || requireAll) {
      data.defaultSheetVisible = booleanOrDefault(
        patch.defaultSheetVisible,
        current?.defaultSheetVisible ?? true,
      );
    }
    const nextTarget = (data.target ??
      current?.target ??
      'TRAIT') as CharacterClassFeatureTargetValue;
    const isReferenceTarget =
      nextTarget === 'TECHNIQUE' || nextTarget === 'SPELL';

    if (isReferenceTarget) {
      if (patch.name !== undefined && String(patch.name ?? '').trim()) {
        throw new BadRequestException(
          'TECHNIQUE/SPELL features cannot use manual name',
        );
      }
      if (
        patch.description !== undefined &&
        String(patch.description ?? '').trim()
      ) {
        throw new BadRequestException(
          'TECHNIQUE/SPELL features cannot use manual description',
        );
      }
      data.name = null;
      data.description = null;
    } else {
      if (patch.name !== undefined || requireAll) {
        const name = String(patch.name ?? '').trim();
        if (!name) throw new BadRequestException('class feature name required');
        data.name = name;
      }
      if (patch.description !== undefined || requireAll) {
        data.description = String(patch.description ?? '').trim();
      }
    }

    if (
      patch.skillEntryId !== undefined ||
      requireAll ||
      nextTarget !== 'TECHNIQUE'
    ) {
      data.skillEntryId =
        nextTarget === 'TECHNIQUE'
          ? positiveIntOrNull(patch.skillEntryId)
          : null;
    }
    if (
      patch.spellEntryId !== undefined ||
      requireAll ||
      nextTarget !== 'SPELL'
    ) {
      data.spellEntryId =
        nextTarget === 'SPELL' ? positiveIntOrNull(patch.spellEntryId) : null;
    }
    return data;
  }

  private async validateClassFeatureReference(data: {
    target?: unknown;
    skillEntryId?: unknown;
    spellEntryId?: unknown;
  }) {
    const target = normalizeClassFeatureTarget(data.target);
    const skillEntryId = positiveIntOrNull(data.skillEntryId) ?? null;
    const spellEntryId = positiveIntOrNull(data.spellEntryId) ?? null;

    if (target === 'TECHNIQUE') {
      if (!skillEntryId) {
        throw new BadRequestException(
          'TECHNIQUE feature requires skillEntryId',
        );
      }
      if (spellEntryId) {
        throw new BadRequestException(
          'TECHNIQUE feature cannot use spellEntryId',
        );
      }
      const row = await this.prisma.skillEntry.findUnique({
        where: { id: skillEntryId },
        select: { id: true },
      });
      if (!row) throw new NotFoundException('skill entry not found');
      return;
    }

    if (target === 'SPELL') {
      if (!spellEntryId) {
        throw new BadRequestException('SPELL feature requires spellEntryId');
      }
      if (skillEntryId) {
        throw new BadRequestException('SPELL feature cannot use skillEntryId');
      }
      const row = await this.prisma.spellEntry.findUnique({
        where: { id: spellEntryId },
        select: { id: true },
      });
      if (!row) throw new NotFoundException('spell entry not found');
      return;
    }

    if (skillEntryId || spellEntryId) {
      throw new BadRequestException(
        'only TECHNIQUE/SPELL features can use references',
      );
    }
  }

  private validateClassFeatureText(data: {
    target?: unknown;
    name?: unknown;
    description?: unknown;
  }) {
    const target = normalizeClassFeatureTarget(data.target);
    if (target === 'TECHNIQUE' || target === 'SPELL') return;
    const name = String(data.name ?? '').trim();
    if (!name) throw new BadRequestException('class feature name required');
  }

  private normalizeChoiceGroupPatch(
    patch: ChoiceGroupPatch,
    requireAll: boolean,
  ) {
    const data: Record<string, unknown> = {};
    if (patch.level !== undefined || requireAll) {
      data.level = positiveInt(patch.level);
    }
    if (patch.name !== undefined || requireAll) {
      data.name = requiredText(patch.name, 'choice group name');
    }
    if (patch.description !== undefined || requireAll) {
      data.description = String(patch.description ?? '').trim();
    }
    if (patch.selectionCount !== undefined || requireAll) {
      const selectionCount = Math.trunc(Number(patch.selectionCount));
      if (!Number.isFinite(selectionCount) || selectionCount < 1) {
        throw new BadRequestException(
          'choice group selectionCount must be a positive integer',
        );
      }
      data.selectionCount = selectionCount;
    }
    if (patch.order !== undefined || requireAll) {
      data.order = intOrNull(patch.order) ?? 0;
    }
    if (patch.branchOptionId !== undefined || requireAll) {
      data.branchOptionId = textOrNull(patch.branchOptionId);
    }
    return data;
  }

  private normalizeChoiceOptionTarget(
    value: unknown,
  ): CharacterClassFeatureTargetValue {
    const target = normalizeClassFeatureTarget(value);
    if (CLASS_CHOICE_OPTION_TARGETS.has(target)) return target;
    throw new BadRequestException(
      'choice option target supports only TRAIT, FEAT, TECHNIQUE, SPELL',
    );
  }

  private normalizeChoiceOptionPatch(
    patch: ChoiceOptionPatch,
    requireAll: boolean,
    current?: {
      target?: CharacterClassFeatureTargetValue | string | null;
      skillEntryId?: number | null;
      spellEntryId?: number | null;
      defaultSheetVisible?: boolean | null;
    },
  ) {
    const data: Record<string, unknown> = {};
    if (patch.target !== undefined || requireAll) {
      data.target = this.normalizeChoiceOptionTarget(patch.target);
    }
    if (patch.order !== undefined || requireAll) {
      data.order = intOrNull(patch.order) ?? 0;
    }
    if (patch.defaultSheetVisible !== undefined || requireAll) {
      data.defaultSheetVisible = booleanOrDefault(
        patch.defaultSheetVisible,
        current?.defaultSheetVisible ?? true,
      );
    }
    const nextTarget = (data.target ??
      current?.target ??
      'TRAIT') as CharacterClassFeatureTargetValue;
    if (!CLASS_CHOICE_OPTION_TARGETS.has(nextTarget)) {
      throw new BadRequestException(
        'choice option target supports only TRAIT, FEAT, TECHNIQUE, SPELL',
      );
    }
    const isReferenceTarget =
      nextTarget === 'TECHNIQUE' || nextTarget === 'SPELL';

    if (isReferenceTarget) {
      if (patch.name !== undefined && String(patch.name ?? '').trim()) {
        throw new BadRequestException(
          'TECHNIQUE/SPELL choice options cannot use manual name',
        );
      }
      if (
        patch.description !== undefined &&
        String(patch.description ?? '').trim()
      ) {
        throw new BadRequestException(
          'TECHNIQUE/SPELL choice options cannot use manual description',
        );
      }
      data.name = null;
      data.description = null;
    } else {
      if (patch.name !== undefined || requireAll) {
        const name = String(patch.name ?? '').trim();
        if (!name) throw new BadRequestException('choice option name required');
        data.name = name;
      }
      if (patch.description !== undefined || requireAll) {
        data.description = String(patch.description ?? '').trim();
      }
    }

    if (
      patch.skillEntryId !== undefined ||
      requireAll ||
      nextTarget !== 'TECHNIQUE'
    ) {
      data.skillEntryId =
        nextTarget === 'TECHNIQUE'
          ? positiveIntOrNull(patch.skillEntryId)
          : null;
    }
    if (
      patch.spellEntryId !== undefined ||
      requireAll ||
      nextTarget !== 'SPELL'
    ) {
      data.spellEntryId =
        nextTarget === 'SPELL' ? positiveIntOrNull(patch.spellEntryId) : null;
    }
    return data;
  }

  private async validateChoiceOptionReference(data: {
    target?: unknown;
    skillEntryId?: unknown;
    spellEntryId?: unknown;
  }) {
    const target = this.normalizeChoiceOptionTarget(data.target);
    await this.validateClassFeatureReference({
      target,
      skillEntryId: data.skillEntryId,
      spellEntryId: data.spellEntryId,
    });
  }

  private validateChoiceOptionText(data: {
    target?: unknown;
    name?: unknown;
    description?: unknown;
  }) {
    const target = this.normalizeChoiceOptionTarget(data.target);
    if (target === 'TECHNIQUE' || target === 'SPELL') return;
    const name = String(data.name ?? '').trim();
    if (!name) throw new BadRequestException('choice option name required');
  }

  private async normalizeAdditionalRewardPatch(
    patch: AdditionalRewardPatch,
    requireAll: boolean,
    current?: {
      rewardType?: string | null;
      name?: string | null;
      description?: string | null;
      order?: number | null;
      skillEntryId?: number | null;
      spellEntryId?: number | null;
      referencedFeatureDefinitionId?: string | null;
      referencedChoiceOptionId?: string | null;
      referencedChoiceGroupId?: string | null;
    },
  ) {
    const data: Record<string, unknown> = {};
    const currentType = current?.rewardType ?? 'TRAIT';
    const nextType =
      patch.rewardType !== undefined || requireAll
        ? normalizeAdditionalRewardType(patch.rewardType)
        : currentType;
    const typeChanged = nextType !== currentType;
    if (patch.rewardType !== undefined || requireAll)
      data.rewardType = nextType;
    if (patch.order !== undefined || requireAll) {
      data.order = intOrNull(patch.order) ?? 0;
    }

    const resetPayload = requireAll || typeChanged;
    const setNull = (field: string) => {
      if (
        resetPayload ||
        patch[field as keyof AdditionalRewardPatch] !== undefined
      ) {
        data[field] = null;
      }
    };
    const requireId = (value: unknown, label: string) => {
      const id = textOrNull(value);
      if (!id) throw new BadRequestException(`${label} required`);
      return id;
    };

    if (nextType === 'TRAIT' || nextType === 'FEAT') {
      if (patch.name !== undefined || requireAll || typeChanged) {
        data.name = requiredText(
          patch.name ?? current?.name,
          'additional reward name',
        );
      }
      if (patch.description !== undefined || requireAll || typeChanged) {
        data.description = String(
          patch.description ?? current?.description ?? '',
        ).trim();
      }
      data.skillEntryId = null;
      data.spellEntryId = null;
      data.referencedFeatureDefinitionId = null;
      data.referencedChoiceOptionId = null;
      data.referencedChoiceGroupId = null;
      return data;
    }

    data.name = null;
    data.description = null;

    if (nextType === 'TECHNIQUE') {
      const skillEntryId =
        patch.skillEntryId !== undefined || requireAll || typeChanged
          ? positiveIntOrNull(patch.skillEntryId ?? current?.skillEntryId)
          : (current?.skillEntryId ?? null);
      if (!skillEntryId)
        throw new BadRequestException('TECHNIQUE reward requires skillEntryId');
      const row = await this.prisma.skillEntry.findUnique({
        where: { id: skillEntryId },
        select: { id: true },
      });
      if (!row) throw new NotFoundException('skill entry not found');
      data.skillEntryId = skillEntryId;
      data.spellEntryId = null;
      data.referencedFeatureDefinitionId = null;
      data.referencedChoiceOptionId = null;
      data.referencedChoiceGroupId = null;
      return data;
    }

    if (nextType === 'SPELL') {
      const spellEntryId =
        patch.spellEntryId !== undefined || requireAll || typeChanged
          ? positiveIntOrNull(patch.spellEntryId ?? current?.spellEntryId)
          : (current?.spellEntryId ?? null);
      if (!spellEntryId)
        throw new BadRequestException('SPELL reward requires spellEntryId');
      const row = await this.prisma.spellEntry.findUnique({
        where: { id: spellEntryId },
        select: { id: true },
      });
      if (!row) throw new NotFoundException('spell entry not found');
      data.skillEntryId = null;
      data.spellEntryId = spellEntryId;
      data.referencedFeatureDefinitionId = null;
      data.referencedChoiceOptionId = null;
      data.referencedChoiceGroupId = null;
      return data;
    }

    setNull('skillEntryId');
    setNull('spellEntryId');
    const refFeature =
      patch.referencedFeatureDefinitionId !== undefined ||
      requireAll ||
      typeChanged
        ? textOrNull(
            patch.referencedFeatureDefinitionId ??
              current?.referencedFeatureDefinitionId,
          )
        : (current?.referencedFeatureDefinitionId ?? null);
    const refOption =
      patch.referencedChoiceOptionId !== undefined || requireAll || typeChanged
        ? textOrNull(
            patch.referencedChoiceOptionId ?? current?.referencedChoiceOptionId,
          )
        : (current?.referencedChoiceOptionId ?? null);
    const refGroup =
      patch.referencedChoiceGroupId !== undefined || requireAll || typeChanged
        ? textOrNull(
            patch.referencedChoiceGroupId ?? current?.referencedChoiceGroupId,
          )
        : (current?.referencedChoiceGroupId ?? null);

    if (nextType === 'GRANT_FEATURE') {
      const id = requireId(refFeature, 'referencedFeatureDefinitionId');
      const row = await this.prisma.characterClassFeatureDefinition.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!row)
        throw new NotFoundException('referenced class feature not found');
      data.referencedFeatureDefinitionId = id;
      data.referencedChoiceOptionId = null;
      data.referencedChoiceGroupId = null;
      return data;
    }

    if (nextType === 'GRANT_CHOICE_OPTION') {
      const id = requireId(refOption, 'referencedChoiceOptionId');
      const row = await this.prisma.characterClassChoiceOption.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!row)
        throw new NotFoundException('referenced choice option not found');
      data.referencedFeatureDefinitionId = null;
      data.referencedChoiceOptionId = id;
      data.referencedChoiceGroupId = null;
      return data;
    }

    const id = requireId(refGroup, 'referencedChoiceGroupId');
    const row = await this.prisma.characterClassChoiceGroup.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('referenced choice group not found');
    data.referencedFeatureDefinitionId = null;
    data.referencedChoiceOptionId = null;
    data.referencedChoiceGroupId = id;
    return data;
  }

  private async normalizeFeatureUpgradePatch(
    patch: FeatureUpgradePatch,
    requireAll: boolean,
    current?: {
      targetFeatureDefinitionId?: string | null;
      targetChoiceOptionId?: string | null;
      unlockLevel?: number | null;
      name?: string | null;
      description?: string | null;
      displayOrder?: number | null;
      branchOptionId?: string | null;
    },
  ) {
    const data: Record<string, unknown> = {};
    const targetType = String(
      patch.targetType ??
        (current?.targetChoiceOptionId ? 'CHOICE_OPTION' : 'FEATURE'),
    )
      .trim()
      .toUpperCase();

    if (patch.unlockLevel !== undefined || requireAll) {
      data.unlockLevel = positiveInt(patch.unlockLevel ?? current?.unlockLevel);
    }
    if (patch.name !== undefined || requireAll) {
      data.name = textOrNull(patch.name);
    }
    if (patch.description !== undefined || requireAll) {
      data.description = requiredText(
        patch.description ?? current?.description,
        'upgrade description',
      );
    }
    if (patch.displayOrder !== undefined || requireAll) {
      data.displayOrder =
        intOrNull(patch.displayOrder ?? current?.displayOrder) ?? 0;
    }
    if (patch.branchOptionId !== undefined || requireAll) {
      data.branchOptionId = textOrNull(
        patch.branchOptionId ?? current?.branchOptionId,
      );
    }

    const targetChanged =
      patch.targetType !== undefined ||
      patch.targetFeatureDefinitionId !== undefined ||
      patch.targetChoiceOptionId !== undefined ||
      requireAll;
    if (targetChanged) {
      if (targetType === 'FEATURE') {
        data.targetFeatureDefinitionId = this.normalizeId(
          patch.targetFeatureDefinitionId ?? current?.targetFeatureDefinitionId,
          'targetFeatureDefinitionId',
        );
        data.targetChoiceOptionId = null;
      } else if (targetType === 'CHOICE_OPTION') {
        data.targetChoiceOptionId = this.normalizeId(
          patch.targetChoiceOptionId ?? current?.targetChoiceOptionId,
          'targetChoiceOptionId',
        );
        data.targetFeatureDefinitionId = null;
      } else {
        throw new BadRequestException('invalid upgrade targetType');
      }
    }

    const merged = {
      targetFeatureDefinitionId: Object.prototype.hasOwnProperty.call(
        data,
        'targetFeatureDefinitionId',
      )
        ? (data.targetFeatureDefinitionId as string | null)
        : (current?.targetFeatureDefinitionId ?? null),
      targetChoiceOptionId: Object.prototype.hasOwnProperty.call(
        data,
        'targetChoiceOptionId',
      )
        ? (data.targetChoiceOptionId as string | null)
        : (current?.targetChoiceOptionId ?? null),
      branchOptionId: Object.prototype.hasOwnProperty.call(
        data,
        'branchOptionId',
      )
        ? (data.branchOptionId as string | null)
        : (current?.branchOptionId ?? null),
    };
    await this.validateFeatureUpgradeTargetAndBranch(merged);
    return data;
  }

  private async validateFeatureUpgradeTargetAndBranch(target: {
    targetFeatureDefinitionId?: string | null;
    targetChoiceOptionId?: string | null;
    branchOptionId?: string | null;
  }) {
    const hasFeature = !!target.targetFeatureDefinitionId;
    const hasChoice = !!target.targetChoiceOptionId;
    if (hasFeature === hasChoice) {
      throw new BadRequestException('upgrade requires exactly one target');
    }
    let owner: {
      classDefinitionId?: string | null;
      subclassDefinitionId?: string | null;
    };
    if (target.targetFeatureDefinitionId) {
      const feature =
        await this.prisma.characterClassFeatureDefinition.findUnique({
          where: { id: target.targetFeatureDefinitionId },
          select: { classDefinitionId: true, subclassDefinitionId: true },
        });
      if (!feature) throw new NotFoundException('target feature not found');
      owner = feature;
    } else {
      const option = await this.prisma.characterClassChoiceOption.findUnique({
        where: { id: target.targetChoiceOptionId! },
        select: {
          choiceGroup: {
            select: { classDefinitionId: true, subclassDefinitionId: true },
          },
        },
      });
      if (!option)
        throw new NotFoundException('target choice option not found');
      owner = option.choiceGroup;
    }
    if (target.branchOptionId) {
      await this.validateBranchOptionForOwner(target.branchOptionId, owner);
    }
  }

  private async assertFeatureUpgradeNotDuplicate(
    data: {
      targetFeatureDefinitionId?: string | null;
      targetChoiceOptionId?: string | null;
      branchOptionId?: string | null;
      unlockLevel?: number | null;
    },
    exceptId?: string,
  ) {
    const unlockLevel = positiveInt(data.unlockLevel);
    const duplicate = await this.prisma.characterClassFeatureUpgrade.findFirst({
      where: {
        ...(data.targetFeatureDefinitionId
          ? { targetFeatureDefinitionId: data.targetFeatureDefinitionId }
          : { targetChoiceOptionId: data.targetChoiceOptionId }),
        branchOptionId: data.branchOptionId ?? null,
        unlockLevel,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new BadRequestException(
        'duplicate upgrade for same target, level, and branch',
      );
    }
  }

  private async normalizeFeatureOverridePatch(patch: FeatureOverridePatch) {
    const targetType = String(patch.targetType ?? '')
      .trim()
      .toUpperCase();
    const data: {
      targetFeatureDefinitionId?: string | null;
      targetChoiceOptionId?: string | null;
      visibility: string;
      suppressed: boolean;
      note: string | null;
    } = {
      visibility: 'DEFAULT',
      suppressed: booleanOrDefault(patch.suppressed, false),
      note: textOrNull(patch.note) ?? null,
    };
    const visibility = String(patch.visibility ?? 'DEFAULT')
      .trim()
      .toUpperCase();
    if (!FEATURE_VISIBILITY_OVERRIDES.has(visibility)) {
      throw new BadRequestException('invalid feature visibility override');
    }
    data.visibility = visibility;

    if (targetType === 'FEATURE') {
      data.targetFeatureDefinitionId = this.normalizeId(
        patch.targetFeatureDefinitionId,
        'targetFeatureDefinitionId',
      );
      data.targetChoiceOptionId = null;
      const feature =
        await this.prisma.characterClassFeatureDefinition.findUnique({
          where: { id: data.targetFeatureDefinitionId },
          select: { id: true },
        });
      if (!feature) throw new NotFoundException('target feature not found');
      return data;
    }

    if (targetType === 'CHOICE_OPTION') {
      data.targetChoiceOptionId = this.normalizeId(
        patch.targetChoiceOptionId,
        'targetChoiceOptionId',
      );
      data.targetFeatureDefinitionId = null;
      const option = await this.prisma.characterClassChoiceOption.findUnique({
        where: { id: data.targetChoiceOptionId },
        select: { id: true },
      });
      if (!option)
        throw new NotFoundException('target choice option not found');
      return data;
    }

    throw new BadRequestException('invalid feature override targetType');
  }

  private validateChoiceGroupForCharacterClass(
    characterClass: any,
    group: any,
  ) {
    if (group.classDefinitionId) {
      if (group.classDefinitionId !== characterClass.classDefinitionId) {
        throw new BadRequestException('choice group does not belong to class');
      }
      return;
    }
    if (group.subclassDefinitionId) {
      if (group.subclassDefinitionId !== characterClass.subclassDefinitionId) {
        throw new BadRequestException(
          'choice group does not belong to subclass',
        );
      }
      return;
    }
    throw new BadRequestException('choice group has no owner');
  }

  private normalizeSheetPatch(patch: SheetPatch) {
    const data: Record<string, unknown> = {};
    for (const key of ['race', 'age', 'height', 'weight'] as const) {
      if (patch[key] !== undefined) data[key] = textOrNull(patch[key]);
    }
    for (const key of [
      'hpCur',
      'hpMax',
      'ac',
      'strength',
      'dexterity',
      'constitution',
      'intelligence',
      'wisdom',
      'charisma',
    ] as const) {
      if (patch[key] !== undefined) data[key] = intOrNull(patch[key]);
    }
    for (const key of [
      'proficiencies',
      'spellSlots',
      'metamagic',
      'spellVariants',
      'spells',
      'notes',
    ] as const) {
      if (patch[key] !== undefined) data[key] = patch[key] ?? null;
    }
    return data;
  }
}
