export type HexOrientation = 'pointy' | 'flat';

export type CappedResourceId = 'wood' | 'stone' | 'fabric' | 'weave' | 'food';
export type ResourceId =
  | CappedResourceId
  | 'research'
  | 'order'
  | 'gold';
export type BuildingResourceId = ResourceId | `item:${string}`;

export type PopulationTrackedId =
  | 'settlers'
  | 'engineers'
  | 'scholars'
  | 'laborers';
export type PopulationId = PopulationTrackedId | 'elderly';
export type UpkeepPopulationId = PopulationId | 'anyNonElderly';

export type PopulationEntry = {
  total: number;
  available?: number;
};

export type CityPopulationState = Record<PopulationId, PopulationEntry>;

export type CityGlobalState = {
  values: Record<ResourceId, number>;
  caps: Record<CappedResourceId, number>;
  overflowToGold: Record<CappedResourceId, number>;
  warehouse?: Record<string, number>;
  day: number;
  satisfaction: number;
  populationCap: number;
  population: CityPopulationState;
};

export type MapTileStatePreset = {
  id: string;
  name: string;
  color: string;
  hasValue: boolean;
};

export type MapTileStateAssignment = {
  presetId: string;
  value?: string;
};

export type MapTileRegionState = {
  spaceUsed?: number;
  spaceCap?: number;
  satisfaction?: number;
  threat?: number;
  pollution?: number;
};

export type BuildingPresetLine = {
  id: string;
  text: string;
};

export type BuildingPreset = {
  id: string;
  name: string;
  color: string;
  tier?: string;
  effort?: number;
  space?: number;
  description?: string;
  buildCosts?: BuildingPresetLine[];
  researchCosts?: BuildingPresetLine[];
  upkeep?: BuildingPresetLine[];
  dailyEffects?: BuildingPresetLine[];
  requirements?: BuildingPresetLine[];
  notes?: BuildingPresetLine[];
};

export type BuildingRuleArithmeticOp =
  | 'add'
  | 'sub'
  | 'mul'
  | 'div'
  | 'min'
  | 'max';

export type BuildingRuleComparisonOp =
  | 'eq'
  | 'ne'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte';

export type BuildingRuleLogicOp = 'and' | 'or';
export type BuildingRuleScope = 'self' | 'adjacent';
export type BuildingRuleActionTargetScope = 'self' | 'range';

export type BuildingRuleExpr =
  | { kind: 'const'; value: number }
  | { kind: 'resource'; resourceId: BuildingResourceId }
  | { kind: 'population'; populationId: PopulationId; field: 'total' | 'available' }
  | {
      kind: 'tileMetric';
      metric: 'adjacentTagCount' | 'adjacentBuildingCount' | 'tileStateValue';
      key: string;
    }
  | { kind: 'binary'; op: BuildingRuleArithmeticOp; left: BuildingRuleExpr; right: BuildingRuleExpr }
  | { kind: 'clamp'; value: BuildingRuleExpr; min?: number; max?: number }
  | { kind: 'randPct'; pct: number };

export type BuildingRulePredicate =
  | { kind: 'compare'; op: BuildingRuleComparisonOp; left: BuildingRuleExpr; right: BuildingRuleExpr }
  | {
      kind: 'tileRegionCompare';
      field: 'spaceRemaining' | 'pollution' | 'threat' | 'satisfaction';
      op: BuildingRuleComparisonOp;
      value: number;
    }
  | { kind: 'hasTag'; tagId: string; scope: BuildingRuleScope }
  | { kind: 'hasBuilding'; presetId: string; scope: BuildingRuleScope }
  | { kind: 'logic'; op: BuildingRuleLogicOp; rules: BuildingRulePredicate[] }
  | BuildingPlacementRule;

export type BuildingRuleAction =
  | {
      kind: 'adjustResource';
      resourceId: BuildingResourceId;
      delta: BuildingRuleExpr;
      target?: BuildingRuleActionTargetScope;
      distance?: number;
    }
  | {
      kind: 'adjustResourceCap';
      resourceId: 'wood' | 'stone' | 'fabric' | 'weave' | 'food';
      delta: BuildingRuleExpr;
      target?: BuildingRuleActionTargetScope;
      distance?: number;
    }
  | {
      kind: 'adjustPopulation';
      populationId: PopulationTrackedId;
      field: 'total' | 'available';
      delta: BuildingRuleExpr;
      target?: BuildingRuleActionTargetScope;
      distance?: number;
    }
  | {
      kind: 'adjustPopulationCap';
      delta: BuildingRuleExpr;
      target?: BuildingRuleActionTargetScope;
      distance?: number;
    }
  | {
      kind: 'convertPopulation';
      from: PopulationTrackedId;
      to: PopulationTrackedId;
      amount: BuildingRuleExpr;
      target?: BuildingRuleActionTargetScope;
      distance?: number;
    }
  | {
      kind: 'adjustTileRegion';
      field: keyof MapTileRegionState;
      delta: BuildingRuleExpr;
      target?: BuildingRuleActionTargetScope;
      distance?: number;
    }
  | {
      kind: 'addTileState';
      tagPresetId: string;
      value?: string;
      target?: BuildingRuleActionTargetScope;
      distance?: number;
    }
  | {
      kind: 'removeTileState';
      tagPresetId: string;
      target?: BuildingRuleActionTargetScope;
      distance?: number;
    };

export type BuildingExecutionRule = {
  id: string;
  intervalDays?: number;
  when?: BuildingRulePredicate;
  actions: BuildingRuleAction[];
};

export type BuildingPlacementRule =
  | { kind: 'uniquePerTile'; maxCount?: number }
  | {
      kind: 'tileRegionCompare';
      field: 'spaceRemaining' | 'pollution' | 'threat' | 'satisfaction';
      op: BuildingRuleComparisonOp;
      value: number;
    }
  | {
      kind: 'requireTagInRange';
      tagPresetId: string;
      distance?: number;
      minCount?: number;
      negate?: boolean;
      repeat?: boolean;
      valueMode?: 'equals' | 'contains';
      value?: string;
    }
  | {
      kind: 'requireBuildingInRange';
      presetId: string;
      distance?: number;
      minCount?: number;
      negate?: boolean;
      repeat?: boolean;
    }
  | { kind: 'custom'; label: string };

export type WorldMapBuildingPresetRow = {
  id: string;
  mapId: string | null;
  name: string;
  color: string;
  tier?: string;
  effort?: number;
  space?: number;
  description?: string;
  placementRules?: BuildingPlacementRule[];
  buildCost?: Partial<Record<BuildingResourceId, number>>;
  researchCost?: Partial<Record<BuildingResourceId, number>>;
  upkeep?: {
    resources?: Partial<Record<BuildingResourceId, number>>;
    population?: Partial<Record<UpkeepPopulationId, number>>;
  };
  effects?: {
    onBuild?: BuildingExecutionRule[];
    daily?: BuildingExecutionRule[];
    onRemove?: BuildingExecutionRule[];
  };
  createdAt: string;
  updatedAt: string;
};

export type WorldMapBuildingInstanceRow = {
  id: string;
  mapId: string;
  presetId: string;
  col: number;
  row: number;
  enabled: boolean;
  progressEffort: number;
  meta?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type WorldMapTickLogRow = {
  id: string;
  mapId: string;
  day: number;
  summary?: Record<string, unknown>;
  createdAt: string;
};

export type WorldMapRecord = {
  id: string;
  ownerId: string;
  name: string;
  imageUrl?: string | null;
  imageWidth?: number | null;
  imageHeight?: number | null;
  hexSize: number;
  originX: number;
  originY: number;
  cols: number;
  rows: number;
  orientation: HexOrientation;
  cityGlobal: CityGlobalState;
  tileStatePresets?: MapTileStatePreset[];
  tileStateAssignments?: Record<string, MapTileStateAssignment[]>;
  tileRegionStates?: Record<string, MapTileRegionState>;
  buildingPresets?: BuildingPreset[];
  buildingPresetRows?: WorldMapBuildingPresetRow[];
  buildingInstances?: WorldMapBuildingInstanceRow[];
  tickLogs?: WorldMapTickLogRow[];
  createdAt: string;
  updatedAt: string;
};

export type PublicWorldMap = WorldMapRecord;


