import type { Unit } from '../encounter/encounter.types';

export type UnitPresetData = Omit<Unit, 'id'>;

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
