export const EQUIPMENT_SLOTS = [
  '머리',
  '목',
  '견갑',
  '망토',
  '옷',
  '갑옷',
  '장갑',
  '신발',
  '허리장신구',
  '품',
  '브로치',
  '귀',
  '반지',
  '왼손',
  '오른손',
] as const;

export const EQUIPMENT_OCCUPANCY_SLOTS = [
  '선택 슬롯',
  ...EQUIPMENT_SLOTS,
] as const;

export const CHARACTER_FEATURE_KINDS = [
  'FEAT',
  'TRAIT',
  'ITEM_EFFECT',
  'METAMAGIC',
  'SPELL_VARIANT',
  'SPELL',
  'NOTE',
] as const;

export type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number];
export type EquipmentOccupancySlot = (typeof EQUIPMENT_OCCUPANCY_SLOTS)[number];
export type CharacterFeatureKind = (typeof CHARACTER_FEATURE_KINDS)[number];
