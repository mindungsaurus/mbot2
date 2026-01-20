export type TagPresetKind = 'toggle' | 'stack';

export type CreateTagPresetFolderDto = {
  name?: string;
  order?: number;
  parentId?: string | null;
};

export type UpdateTagPresetFolderDto = {
  name?: string;
  order?: number | null;
  parentId?: string | null;
};

export type CreateTagPresetDto = {
  name?: string;
  folderId?: string | null;
  order?: number;
  kind?: TagPresetKind;
  decOnTurnStart?: boolean;
  decOnTurnEnd?: boolean;
  colorCode?: number | null;
};

export type UpdateTagPresetDto = {
  name?: string;
  folderId?: string | null;
  order?: number | null;
  kind?: TagPresetKind;
  decOnTurnStart?: boolean;
  decOnTurnEnd?: boolean;
  colorCode?: number | null;
};
