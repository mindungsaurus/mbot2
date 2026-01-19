import type { Unit } from '../encounter/encounter.types';

export type HpFormula = {
  expr: string;
  params?: Record<string, number>;
  min?: number;
  max?: number;
};

export type UnitPresetData = Omit<Unit, 'id'> & {
  hpFormula?: HpFormula;
};

export type CreateUnitPresetFolderDto = {
  name?: string;
  order?: number;
  parentId?: string | null;
};

export type UpdateUnitPresetFolderDto = {
  name?: string;
  order?: number | null;
  parentId?: string | null;
};

export type CreateUnitPresetDto = {
  name?: string;
  folderId?: string | null;
  order?: number;
  data?: UnitPresetData;
};

export type UpdateUnitPresetDto = {
  name?: string;
  folderId?: string | null;
  order?: number | null;
  data?: UnitPresetData;
};

export type ValidateHpFormulaDto = {
  expr?: string;
  params?: Record<string, number>;
  min?: number;
  max?: number;
};
