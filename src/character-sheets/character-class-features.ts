export type CharacterClassFeatureTargetValue =
  | 'TRAIT'
  | 'FEAT'
  | 'TECHNIQUE'
  | 'SPELL'
  | 'METAMAGIC'
  | 'FIGHTING_STYLE'
  | 'RESOURCE_OR_SLOT'
  | 'CUSTOM';

export type CharacterClassAdditionalRewardTypeValue =
  | 'TRAIT'
  | 'FEAT'
  | 'TECHNIQUE'
  | 'SPELL'
  | 'GRANT_FEATURE'
  | 'GRANT_CHOICE_OPTION'
  | 'GRANT_UNACQUIRED_CHOICE_OPTIONS';

export type CharacterClassAdditionalRewardSource = {
  id: string;
  featureDefinitionId?: string | null;
  choiceOptionId?: string | null;
  rewardType: CharacterClassAdditionalRewardTypeValue | string;
  name?: string | null;
  description?: string | null;
  skillEntryId?: number | null;
  spellEntryId?: number | null;
  referencedFeatureDefinitionId?: string | null;
  referencedChoiceOptionId?: string | null;
  referencedChoiceGroupId?: string | null;
  order: number;
  skillEntry?: CharacterClassFeatureDefinitionSource['skillEntry'];
  spellEntry?: CharacterClassFeatureDefinitionSource['spellEntry'];
  referencedFeatureDefinition?: CharacterClassFeatureDefinitionSource | null;
  referencedChoiceOption?: CharacterClassChoiceOptionSource | null;
  referencedChoiceGroup?: CharacterClassChoiceGroupSource | null;
  createdAt?: Date | string;
};

export type CharacterClassFeatureUpgradeSource = {
  id: string;
  targetFeatureDefinitionId?: string | null;
  targetChoiceOptionId?: string | null;
  branchOptionId?: string | null;
  branchOption?: ProgressionBranchOptionSource | null;
  unlockLevel: number;
  name?: string | null;
  description: string;
  displayOrder: number;
  createdAt?: Date | string;
};

export type CharacterFeatureVisibilityOverrideValue =
  | 'DEFAULT'
  | 'FORCE_SHOW'
  | 'FORCE_HIDE';

export type CharacterFeatureOverrideSource = {
  id: string;
  targetFeatureDefinitionId?: string | null;
  targetChoiceOptionId?: string | null;
  visibility: CharacterFeatureVisibilityOverrideValue | string;
  suppressed: boolean;
  note?: string | null;
};

export type CharacterClassFeatureDefinitionSource = {
  id: string;
  level: number;
  name?: string | null;
  description?: string | null;
  target: CharacterClassFeatureTargetValue | string;
  order: number;
  defaultSheetVisible?: boolean | null;
  branchOptionId?: string | null;
  branchOption?: ProgressionBranchOptionSource | null;
  skillEntryId?: number | null;
  spellEntryId?: number | null;
  skillEntry?: {
    id: number;
    skillKey: string;
    jobName: string;
    skillName: string;
    conditionText?: string | null;
    titleRaw: string;
    bodyRaw: string;
  } | null;
  spellEntry?: {
    id: number;
    spellKey: string;
    spellLevel: string;
    spellNumber?: number | null;
    spellName: string;
    titleRaw: string;
    school?: string | null;
    bodyRaw: string;
  } | null;
  additionalRewards?: CharacterClassAdditionalRewardSource[];
  upgrades?: CharacterClassFeatureUpgradeSource[];
  createdAt?: Date | string;
};

export type CharacterClassChoiceOptionSource = {
  id: string;
  choiceGroupId: string;
  name?: string | null;
  description?: string | null;
  target: CharacterClassFeatureTargetValue | string;
  order: number;
  defaultSheetVisible?: boolean | null;
  skillEntryId?: number | null;
  spellEntryId?: number | null;
  skillEntry?: CharacterClassFeatureDefinitionSource['skillEntry'];
  spellEntry?: CharacterClassFeatureDefinitionSource['spellEntry'];
  additionalRewards?: CharacterClassAdditionalRewardSource[];
  upgrades?: CharacterClassFeatureUpgradeSource[];
  createdAt?: Date | string;
};

export type CharacterClassChoiceGroupSource = {
  id: string;
  classDefinitionId?: string | null;
  subclassDefinitionId?: string | null;
  branchOptionId?: string | null;
  branchOption?: ProgressionBranchOptionSource | null;
  level: number;
  name: string;
  description?: string | null;
  selectionCount: number;
  order: number;
  options?: CharacterClassChoiceOptionSource[];
  createdAt?: Date | string;
};

export type ProgressionBranchOptionSource = {
  id: string;
  branchGroupId: string;
  name: string;
  description?: string | null;
  displayOrder?: number | null;
};

export type ProgressionBranchGroupSource = {
  id: string;
  classDefinitionId?: string | null;
  subclassDefinitionId?: string | null;
  name: string;
  description?: string | null;
  unlockLevel: number;
  displayOrder?: number | null;
  options?: ProgressionBranchOptionSource[];
};

export type CharacterClassChoiceSelectionSource = {
  id: string;
  characterClassId: string;
  choiceGroupId: string;
  choiceOptionId: string;
};

export type CharacterClassBranchSelectionSource = {
  id: string;
  characterClassId: string;
  branchGroupId: string;
  branchOptionId: string;
  branchGroup?: ProgressionBranchGroupSource | null;
  branchOption?: ProgressionBranchOptionSource | null;
};

export type CharacterClassFeatureClassSource = {
  id: string;
  level: number;
  classDefinition?: {
    id: string;
    name: string;
    features?: CharacterClassFeatureDefinitionSource[];
    choiceGroups?: CharacterClassChoiceGroupSource[];
    branchGroups?: ProgressionBranchGroupSource[];
  } | null;
  subclassDefinition?: {
    id: string;
    name: string;
    features?: CharacterClassFeatureDefinitionSource[];
    choiceGroups?: CharacterClassChoiceGroupSource[];
    branchGroups?: ProgressionBranchGroupSource[];
  } | null;
  choiceSelections?: CharacterClassChoiceSelectionSource[];
  branchSelections?: CharacterClassBranchSelectionSource[];
};

export type AutomaticCharacterClassFeature = {
  id: string;
  definitionId: string;
  target: CharacterClassFeatureTargetValue | string;
  name: string;
  description: string;
  level: number;
  order: number;
  sourceType: 'CLASS' | 'SUBCLASS';
  sourceClassId: string;
  sourceClassName: string;
  sourceSubclassId?: string | null;
  sourceSubclassName?: string | null;
  sourceLabel: string;
  acquisitionType: 'GUARANTEED' | 'SELECTED' | 'INDIRECT';
  definitionKind?: 'FEATURE' | 'CHOICE_OPTION' | 'ADDITIONAL_REWARD';
  branchGroupId?: string | null;
  branchGroupName?: string | null;
  branchOptionId?: string | null;
  branchOptionName?: string | null;
  choiceGroupId?: string | null;
  choiceGroupName?: string | null;
  choiceOptionId?: string | null;
  skillEntryId?: number | null;
  spellEntryId?: number | null;
  skillEntry?: CharacterClassFeatureDefinitionSource['skillEntry'];
  spellEntry?: CharacterClassFeatureDefinitionSource['spellEntry'];
  sourcePath?: string[];
  sources?: AutomaticClassReferenceSource[];
  rootDefinitionId?: string;
  effectiveUpgradeId?: string | null;
  effectiveUpgradeUnlockLevel?: number | null;
  effectiveUpgradeName?: string | null;
  effectiveUpgradeSourceLabel?: string | null;
  effectiveUpgradeBranchOptionId?: string | null;
  effectiveUpgradeBranchOptionName?: string | null;
  featureOverrideId?: string | null;
  visibilityOverride?: CharacterFeatureVisibilityOverrideValue | string;
  suppressed?: boolean;
  overrideNote?: string | null;
  defaultSheetVisible?: boolean;
  effectiveSheetVisible?: boolean;
};

export type AutomaticClassReferenceSource = {
  featureDefinitionId: string;
  definitionId?: string;
  definitionKind?: 'FEATURE' | 'CHOICE_OPTION' | 'ADDITIONAL_REWARD';
  sourceType: 'CLASS' | 'SUBCLASS';
  sourceClassId: string;
  sourceClassName: string;
  sourceSubclassId?: string | null;
  sourceSubclassName?: string | null;
  sourceLevel: number;
  sourceLabel: string;
  acquisitionType: 'GUARANTEED' | 'SELECTED' | 'INDIRECT';
  sourcePath?: string[];
  branchGroupId?: string | null;
  branchGroupName?: string | null;
  branchOptionId?: string | null;
  branchOptionName?: string | null;
  choiceGroupId?: string | null;
  choiceGroupName?: string | null;
  choiceOptionId?: string | null;
};

export type AutomaticClassTechnique = {
  id: string;
  skillEntryId: number;
  skillKey: string;
  skillName: string;
  jobName: string;
  conditionText?: string | null;
  titleRaw: string;
  bodyRaw: string;
  sources: AutomaticClassReferenceSource[];
};

export type AutomaticClassSpell = {
  id: string;
  spellEntryId: number;
  spellKey: string;
  spellLevel: string;
  spellNumber?: number | null;
  spellName: string;
  titleRaw: string;
  school?: string | null;
  bodyRaw: string;
  sources: AutomaticClassReferenceSource[];
};

function safeLevel(value: unknown) {
  const level = Math.trunc(Number(value));
  return Number.isFinite(level) && level > 0 ? level : 0;
}

function sortAutomaticFeatures(
  a: AutomaticCharacterClassFeature,
  b: AutomaticCharacterClassFeature,
) {
  return (
    a.level - b.level ||
    a.order - b.order ||
    a.sourceLabel.localeCompare(b.sourceLabel, 'ko') ||
    a.name.localeCompare(b.name, 'ko')
  );
}

function referenceSource(
  entry: AutomaticCharacterClassFeature,
): AutomaticClassReferenceSource {
  return {
    featureDefinitionId: entry.definitionId,
    sourceType: entry.sourceType,
    sourceClassId: entry.sourceClassId,
    sourceClassName: entry.sourceClassName,
    sourceSubclassId: entry.sourceSubclassId,
    sourceSubclassName: entry.sourceSubclassName,
    sourceLevel: entry.level,
    sourceLabel: entry.sourceLabel,
    acquisitionType: entry.acquisitionType,
    branchGroupId: entry.branchGroupId ?? null,
    branchGroupName: entry.branchGroupName ?? null,
    branchOptionId: entry.branchOptionId ?? null,
    branchOptionName: entry.branchOptionName ?? null,
    choiceGroupId: entry.choiceGroupId ?? null,
    choiceGroupName: entry.choiceGroupName ?? null,
    choiceOptionId: entry.choiceOptionId ?? null,
  };
}

function rewardDisplayName(
  feature:
    | CharacterClassFeatureDefinitionSource
    | CharacterClassChoiceOptionSource,
) {
  if (feature.target === 'TECHNIQUE' && feature.skillEntry) {
    return `기술 획득: ${feature.skillEntry.skillName}`;
  }
  if (feature.target === 'SPELL' && feature.spellEntry) {
    return `주문 획득: ${feature.spellEntry.spellName}`;
  }
  return feature.name ?? '';
}

function rewardDisplayDescription(
  feature:
    | CharacterClassFeatureDefinitionSource
    | CharacterClassChoiceOptionSource,
) {
  if (feature.target === 'TECHNIQUE' && feature.skillEntry) {
    return feature.skillEntry.bodyRaw;
  }
  if (feature.target === 'SPELL' && feature.spellEntry) {
    return feature.spellEntry.bodyRaw;
  }
  return feature.description ?? '';
}

function selectedOptionsForGroup(
  entry: CharacterClassFeatureClassSource,
  group: CharacterClassChoiceGroupSource,
) {
  const selectedOptionIds = new Set(
    (entry.choiceSelections ?? [])
      .filter((selection) => selection.choiceGroupId === group.id)
      .map((selection) => selection.choiceOptionId),
  );
  return (group.options ?? []).filter((option) =>
    selectedOptionIds.has(option.id),
  );
}

function activeBranchSelectionMap(
  entry: CharacterClassFeatureClassSource,
  branchGroups: ProgressionBranchGroupSource[] | undefined,
  classLevel: number,
) {
  const unlockedGroupIds = new Set(
    (branchGroups ?? [])
      .filter((group) => {
        const unlockLevel = safeLevel(group.unlockLevel);
        return unlockLevel && unlockLevel <= classLevel;
      })
      .map((group) => group.id),
  );
  const out = new Map<string, CharacterClassBranchSelectionSource>();
  for (const selection of entry.branchSelections ?? []) {
    if (unlockedGroupIds.has(selection.branchGroupId)) {
      out.set(selection.branchGroupId, selection);
    }
  }
  return out;
}

function isBranchScopedRewardActive(
  branchOptionId: string | null | undefined,
  activeSelections: Map<string, CharacterClassBranchSelectionSource>,
) {
  if (!branchOptionId) return true;
  for (const selection of activeSelections.values()) {
    if (selection.branchOptionId === branchOptionId) return true;
  }
  return false;
}

function branchMetadata(
  branchOption: ProgressionBranchOptionSource | null | undefined,
  activeSelections: Map<string, CharacterClassBranchSelectionSource>,
) {
  if (!branchOption?.id) {
    return {
      branchGroupId: null,
      branchGroupName: null,
      branchOptionId: null,
      branchOptionName: null,
      sourceSuffix: '',
    };
  }
  const selection = activeSelections.get(branchOption.branchGroupId);
  const groupName = selection?.branchGroup?.name ?? null;
  return {
    branchGroupId: branchOption.branchGroupId,
    branchGroupName: groupName,
    branchOptionId: branchOption.id,
    branchOptionName: branchOption.name,
    sourceSuffix: ` - ${branchOption.name}`,
  };
}

type SourceOwnerContext = {
  characterClassId: string;
  classLevel: number;
  sourceType: 'CLASS' | 'SUBCLASS';
  sourceClassId: string;
  sourceClassName: string;
  sourceSubclassId?: string | null;
  sourceSubclassName?: string | null;
  activeBranches: Map<string, CharacterClassBranchSelectionSource>;
};

type ResolveTask = {
  kind: 'FEATURE' | 'CHOICE_OPTION' | 'ADDITIONAL_REWARD';
  key: string;
  feature?: CharacterClassFeatureDefinitionSource;
  option?: CharacterClassChoiceOptionSource;
  reward?: CharacterClassAdditionalRewardSource;
  group?: CharacterClassChoiceGroupSource | null;
  context: SourceOwnerContext;
  sourceLabel: string;
  acquisitionType: 'GUARANTEED' | 'SELECTED' | 'INDIRECT';
  sourcePath: string[];
  keyPath: string[];
};

function sortByProgressionOrder<
  T extends { order?: number | null; createdAt?: Date | string },
>(rows: T[]) {
  return [...rows].sort((a, b) => {
    const createdA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const createdB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return (a.order ?? 0) - (b.order ?? 0) || createdA - createdB;
  });
}

function choiceOptionDisplaySource(
  option: CharacterClassChoiceOptionSource,
  group: CharacterClassChoiceGroupSource,
) {
  return `${group.name} · ${rewardDisplayName(option)}`;
}

function additionalRewardDisplayName(
  reward: CharacterClassAdditionalRewardSource,
) {
  if (reward.rewardType === 'TECHNIQUE' && reward.skillEntry) {
    return `기술 획득: ${reward.skillEntry.skillName}`;
  }
  if (reward.rewardType === 'SPELL' && reward.spellEntry) {
    return `주문 획득: ${reward.spellEntry.spellName}`;
  }
  return reward.name ?? '';
}

function additionalRewardDisplayDescription(
  reward: CharacterClassAdditionalRewardSource,
) {
  if (reward.rewardType === 'TECHNIQUE' && reward.skillEntry) {
    return reward.skillEntry.bodyRaw;
  }
  if (reward.rewardType === 'SPELL' && reward.spellEntry) {
    return reward.spellEntry.bodyRaw;
  }
  return reward.description ?? '';
}

function isOutputRewardTarget(target: string | null | undefined) {
  return (
    target === 'TRAIT' ||
    target === 'FEAT' ||
    target === 'TECHNIQUE' ||
    target === 'SPELL' ||
    target === 'METAMAGIC' ||
    target === 'FIGHTING_STYLE' ||
    target === 'RESOURCE_OR_SLOT' ||
    target === 'CUSTOM'
  );
}

function effectiveUpgradeForRoot(
  upgrades: CharacterClassFeatureUpgradeSource[] | undefined,
  context: SourceOwnerContext,
) {
  const applicable = (upgrades ?? []).filter((upgrade) => {
    const unlockLevel = safeLevel(upgrade.unlockLevel);
    return (
      unlockLevel &&
      unlockLevel <= context.classLevel &&
      isBranchScopedRewardActive(upgrade.branchOptionId, context.activeBranches)
    );
  });
  applicable.sort((a, b) => {
    const aBranch = a.branchOptionId ? 1 : 0;
    const bBranch = b.branchOptionId ? 1 : 0;
    const createdA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const createdB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return (
      safeLevel(b.unlockLevel) - safeLevel(a.unlockLevel) ||
      bBranch - aBranch ||
      (b.displayOrder ?? 0) - (a.displayOrder ?? 0) ||
      createdA - createdB
    );
  });
  return applicable[0] ?? null;
}

function rootOverrideKey(task: ResolveTask) {
  if (task.kind === 'FEATURE' && task.feature)
    return `feature:${task.feature.id}`;
  if (task.kind === 'CHOICE_OPTION' && task.option)
    return `choice:${task.option.id}`;
  return null;
}

function defaultSheetVisibleForTask(task: ResolveTask) {
  if (task.kind === 'FEATURE')
    return task.feature?.defaultSheetVisible !== false;
  if (task.kind === 'CHOICE_OPTION')
    return task.option?.defaultSheetVisible !== false;
  return true;
}

function effectiveSheetVisible(
  defaultSheetVisible: boolean,
  override: CharacterFeatureOverrideSource | null | undefined,
) {
  if (override?.suppressed) return false;
  if (override?.visibility === 'FORCE_SHOW') return true;
  if (override?.visibility === 'FORCE_HIDE') return false;
  return defaultSheetVisible;
}

function referenceFromTask(
  task: ResolveTask,
  entry: AutomaticCharacterClassFeature,
): AutomaticClassReferenceSource {
  return {
    featureDefinitionId: entry.definitionId,
    definitionId: task.key,
    definitionKind: task.kind,
    sourceType: entry.sourceType,
    sourceClassId: entry.sourceClassId,
    sourceClassName: entry.sourceClassName,
    sourceSubclassId: entry.sourceSubclassId,
    sourceSubclassName: entry.sourceSubclassName,
    sourceLevel: entry.level,
    sourceLabel: task.sourceLabel,
    acquisitionType: task.acquisitionType,
    sourcePath: task.sourcePath,
    branchGroupId: entry.branchGroupId ?? null,
    branchGroupName: entry.branchGroupName ?? null,
    branchOptionId: entry.branchOptionId ?? null,
    branchOptionName: entry.branchOptionName ?? null,
    choiceGroupId: entry.choiceGroupId ?? null,
    choiceGroupName: entry.choiceGroupName ?? null,
    choiceOptionId: entry.choiceOptionId ?? null,
  };
}

export function calculateAutomaticClassFeatures(
  characterClasses: CharacterClassFeatureClassSource[],
  featureOverrides: CharacterFeatureOverrideSource[] = [],
): AutomaticCharacterClassFeature[] {
  const byDefinitionKey = new Map<string, AutomaticCharacterClassFeature>();
  const overrideByRootKey = new Map<string, CharacterFeatureOverrideSource>();
  for (const override of featureOverrides) {
    if (override.targetFeatureDefinitionId) {
      overrideByRootKey.set(
        `feature:${override.targetFeatureDefinitionId}`,
        override,
      );
    } else if (override.targetChoiceOptionId) {
      overrideByRootKey.set(
        `choice:${override.targetChoiceOptionId}`,
        override,
      );
    }
  }
  const featureLookup = new Map<
    string,
    {
      feature: CharacterClassFeatureDefinitionSource;
      context: SourceOwnerContext;
    }
  >();
  const choiceOptionLookup = new Map<
    string,
    {
      option: CharacterClassChoiceOptionSource;
      group: CharacterClassChoiceGroupSource;
      context: SourceOwnerContext;
    }
  >();
  const choiceGroupLookup = new Map<
    string,
    {
      group: CharacterClassChoiceGroupSource;
      context: SourceOwnerContext;
    }
  >();
  const selectedChoiceOptionIds = new Set<string>();
  const tasks: ResolveTask[] = [];

  for (const entry of characterClasses) {
    const classLevel = safeLevel(entry.level);
    const classDefinition = entry.classDefinition;
    if (!classDefinition || !classLevel) continue;
    const activeClassBranches = activeBranchSelectionMap(
      entry,
      classDefinition.branchGroups,
      classLevel,
    );
    const classContext: SourceOwnerContext = {
      characterClassId: entry.id,
      classLevel,
      sourceType: 'CLASS',
      sourceClassId: classDefinition.id,
      sourceClassName: classDefinition.name,
      sourceSubclassId: null,
      sourceSubclassName: null,
      activeBranches: activeClassBranches,
    };

    for (const feature of classDefinition.features ?? []) {
      const featureLevel = safeLevel(feature.level);
      if (!featureLevel) continue;
      featureLookup.set(feature.id, { feature, context: classContext });
      if (featureLevel > classLevel) continue;
      if (
        !isBranchScopedRewardActive(feature.branchOptionId, activeClassBranches)
      ) {
        continue;
      }
      const branch = branchMetadata(feature.branchOption, activeClassBranches);
      const sourceLabel = `${classDefinition.name}${branch.sourceSuffix} Lv.${featureLevel}`;
      tasks.push({
        kind: 'FEATURE',
        key: `feature:${feature.id}`,
        feature,
        context: classContext,
        sourceLabel,
        acquisitionType: 'GUARANTEED',
        sourcePath: [sourceLabel],
        keyPath: [`feature:${feature.id}`],
      });
    }

    for (const group of classDefinition.choiceGroups ?? []) {
      const groupLevel = safeLevel(group.level);
      if (!groupLevel) continue;
      choiceGroupLookup.set(group.id, { group, context: classContext });
      for (const option of group.options ?? []) {
        choiceOptionLookup.set(option.id, {
          option,
          group,
          context: classContext,
        });
      }
      if (groupLevel > classLevel) continue;
      if (
        !isBranchScopedRewardActive(group.branchOptionId, activeClassBranches)
      ) {
        continue;
      }
      const branch = branchMetadata(group.branchOption, activeClassBranches);
      for (const option of selectedOptionsForGroup(entry, group)) {
        selectedChoiceOptionIds.add(option.id);
        const sourceLabel = `${classDefinition.name}${branch.sourceSuffix} Lv.${groupLevel} · 선택 특전`;
        tasks.push({
          kind: 'CHOICE_OPTION',
          key: `choice:${option.id}`,
          option,
          group,
          context: classContext,
          sourceLabel,
          acquisitionType: 'SELECTED',
          sourcePath: [sourceLabel, choiceOptionDisplaySource(option, group)],
          keyPath: [`choice:${option.id}`],
        });
      }
    }

    const subclassDefinition = entry.subclassDefinition;
    if (!subclassDefinition) continue;
    const activeSubclassBranches = activeBranchSelectionMap(
      entry,
      subclassDefinition.branchGroups,
      classLevel,
    );
    const subclassContext: SourceOwnerContext = {
      characterClassId: entry.id,
      classLevel,
      sourceType: 'SUBCLASS',
      sourceClassId: classDefinition.id,
      sourceClassName: classDefinition.name,
      sourceSubclassId: subclassDefinition.id,
      sourceSubclassName: subclassDefinition.name,
      activeBranches: activeSubclassBranches,
    };
    for (const feature of subclassDefinition.features ?? []) {
      const featureLevel = safeLevel(feature.level);
      if (!featureLevel) continue;
      featureLookup.set(feature.id, { feature, context: subclassContext });
      if (featureLevel > classLevel) continue;
      if (
        !isBranchScopedRewardActive(
          feature.branchOptionId,
          activeSubclassBranches,
        )
      ) {
        continue;
      }
      const branch = branchMetadata(
        feature.branchOption,
        activeSubclassBranches,
      );
      const sourceLabel = `${classDefinition.name} - ${subclassDefinition.name}${branch.sourceSuffix} Lv.${featureLevel}`;
      tasks.push({
        kind: 'FEATURE',
        key: `feature:${feature.id}`,
        feature,
        context: subclassContext,
        sourceLabel,
        acquisitionType: 'GUARANTEED',
        sourcePath: [sourceLabel],
        keyPath: [`feature:${feature.id}`],
      });
    }

    for (const group of subclassDefinition.choiceGroups ?? []) {
      const groupLevel = safeLevel(group.level);
      if (!groupLevel) continue;
      choiceGroupLookup.set(group.id, { group, context: subclassContext });
      for (const option of group.options ?? []) {
        choiceOptionLookup.set(option.id, {
          option,
          group,
          context: subclassContext,
        });
      }
      if (groupLevel > classLevel) continue;
      if (
        !isBranchScopedRewardActive(
          group.branchOptionId,
          activeSubclassBranches,
        )
      ) {
        continue;
      }
      const branch = branchMetadata(group.branchOption, activeSubclassBranches);
      for (const option of selectedOptionsForGroup(entry, group)) {
        selectedChoiceOptionIds.add(option.id);
        const sourceLabel = `${classDefinition.name} - ${subclassDefinition.name}${branch.sourceSuffix} Lv.${groupLevel} · 선택 특전`;
        tasks.push({
          kind: 'CHOICE_OPTION',
          key: `choice:${option.id}`,
          option,
          group,
          context: subclassContext,
          sourceLabel,
          acquisitionType: 'SELECTED',
          sourcePath: [sourceLabel, choiceOptionDisplaySource(option, group)],
          keyPath: [`choice:${option.id}`],
        });
      }
    }
  }

  const isFeatureAvailable = (
    feature: CharacterClassFeatureDefinitionSource,
    context: SourceOwnerContext,
  ) => {
    const featureLevel = safeLevel(feature.level);
    return (
      !!featureLevel &&
      featureLevel <= context.classLevel &&
      isBranchScopedRewardActive(feature.branchOptionId, context.activeBranches)
    );
  };
  const isChoiceGroupAvailable = (
    group: CharacterClassChoiceGroupSource,
    context: SourceOwnerContext,
  ) => {
    const groupLevel = safeLevel(group.level);
    return (
      !!groupLevel &&
      groupLevel <= context.classLevel &&
      isBranchScopedRewardActive(group.branchOptionId, context.activeBranches)
    );
  };
  const warnCycle = (
    keyPath: string[],
    nextKey: string,
    sourcePath: string[],
  ) => {
    console.warn(
      `[character-class-features] reward cycle detected: ${[
        ...keyPath,
        nextKey,
      ].join(' -> ')} (${sourcePath.join(' -> ')})`,
    );
  };
  const enqueueAdditionalRewards = (
    rewards: CharacterClassAdditionalRewardSource[] | undefined,
    parentTask: ResolveTask,
  ) => {
    for (const reward of sortByProgressionOrder(rewards ?? [])) {
      const label =
        additionalRewardDisplayName(reward) || String(reward.rewardType);
      const nextPath = [...parentTask.sourcePath, label];
      const rewardKey = `reward:${reward.id}`;
      if (
        reward.rewardType === 'TRAIT' ||
        reward.rewardType === 'FEAT' ||
        reward.rewardType === 'TECHNIQUE' ||
        reward.rewardType === 'SPELL'
      ) {
        if (parentTask.keyPath.includes(rewardKey)) {
          warnCycle(parentTask.keyPath, rewardKey, nextPath);
          continue;
        }
        tasks.push({
          kind: 'ADDITIONAL_REWARD',
          key: rewardKey,
          reward,
          context: parentTask.context,
          sourceLabel: parentTask.sourceLabel,
          acquisitionType: 'INDIRECT',
          sourcePath: nextPath,
          keyPath: [...parentTask.keyPath, rewardKey],
        });
        continue;
      }
      if (
        reward.rewardType === 'GRANT_FEATURE' &&
        reward.referencedFeatureDefinitionId
      ) {
        const referenced = featureLookup.get(
          reward.referencedFeatureDefinitionId,
        );
        if (
          !referenced ||
          !isFeatureAvailable(referenced.feature, referenced.context)
        ) {
          continue;
        }
        const nextKey = `feature:${referenced.feature.id}`;
        if (parentTask.keyPath.includes(nextKey)) {
          warnCycle(parentTask.keyPath, nextKey, nextPath);
          continue;
        }
        tasks.push({
          kind: 'FEATURE',
          key: nextKey,
          feature: referenced.feature,
          context: referenced.context,
          sourceLabel: parentTask.sourceLabel,
          acquisitionType: 'INDIRECT',
          sourcePath: nextPath,
          keyPath: [...parentTask.keyPath, nextKey],
        });
        continue;
      }
      if (
        reward.rewardType === 'GRANT_CHOICE_OPTION' &&
        reward.referencedChoiceOptionId
      ) {
        const referenced = choiceOptionLookup.get(
          reward.referencedChoiceOptionId,
        );
        if (
          !referenced ||
          !isChoiceGroupAvailable(referenced.group, referenced.context)
        ) {
          continue;
        }
        const nextKey = `choice:${referenced.option.id}`;
        if (parentTask.keyPath.includes(nextKey)) {
          warnCycle(parentTask.keyPath, nextKey, nextPath);
          continue;
        }
        tasks.push({
          kind: 'CHOICE_OPTION',
          key: nextKey,
          option: referenced.option,
          group: referenced.group,
          context: referenced.context,
          sourceLabel: parentTask.sourceLabel,
          acquisitionType: 'INDIRECT',
          sourcePath: [
            ...nextPath,
            choiceOptionDisplaySource(referenced.option, referenced.group),
          ],
          keyPath: [...parentTask.keyPath, nextKey],
        });
        continue;
      }
      if (
        reward.rewardType === 'GRANT_UNACQUIRED_CHOICE_OPTIONS' &&
        reward.referencedChoiceGroupId
      ) {
        const referenced = choiceGroupLookup.get(
          reward.referencedChoiceGroupId,
        );
        if (
          !referenced ||
          !isChoiceGroupAvailable(referenced.group, referenced.context)
        ) {
          continue;
        }
        for (const option of sortByProgressionOrder(
          referenced.group.options ?? [],
        )) {
          const optionKey = `choice:${option.id}`;
          if (
            selectedChoiceOptionIds.has(option.id) ||
            byDefinitionKey.has(optionKey)
          ) {
            continue;
          }
          if (parentTask.keyPath.includes(optionKey)) {
            warnCycle(parentTask.keyPath, optionKey, nextPath);
            continue;
          }
          tasks.push({
            kind: 'CHOICE_OPTION',
            key: optionKey,
            option,
            group: referenced.group,
            context: referenced.context,
            sourceLabel: parentTask.sourceLabel,
            acquisitionType: 'INDIRECT',
            sourcePath: [
              ...nextPath,
              choiceOptionDisplaySource(option, referenced.group),
            ],
            keyPath: [...parentTask.keyPath, optionKey],
          });
        }
      }
    }
  };

  const resolving = new Set<string>();
  const resolveTask = (task: ResolveTask) => {
    if (resolving.has(task.key)) {
      console.warn(
        `[character-class-features] reward cycle detected: ${[
          ...task.sourcePath,
          task.key,
        ].join(' -> ')}`,
      );
      return;
    }
    const current = byDefinitionKey.get(task.key);
    if (current) {
      current.sources = current.sources ?? [referenceSource(current)];
      current.sources.push(referenceFromTask(task, current));
      return;
    }

    const context = task.context;
    const branch =
      task.kind === 'FEATURE'
        ? branchMetadata(task.feature?.branchOption, context.activeBranches)
        : task.kind === 'CHOICE_OPTION'
          ? branchMetadata(task.group?.branchOption, context.activeBranches)
          : {
              branchGroupId: null,
              branchGroupName: null,
              branchOptionId: null,
              branchOptionName: null,
              sourceSuffix: '',
            };
    const sourceLevel =
      task.kind === 'CHOICE_OPTION' && task.group
        ? safeLevel(task.group.level)
        : task.kind === 'FEATURE' && task.feature
          ? safeLevel(task.feature.level)
          : context.classLevel;
    const target =
      task.kind === 'FEATURE'
        ? task.feature?.target
        : task.kind === 'CHOICE_OPTION'
          ? task.option?.target
          : task.reward?.rewardType;
    if (!isOutputRewardTarget(target)) return;
    const overrideKey = rootOverrideKey(task);
    const override = overrideKey
      ? (overrideByRootKey.get(overrideKey) ?? null)
      : null;
    const defaultSheetVisible = defaultSheetVisibleForTask(task);
    const suppressed = !!override?.suppressed;
    const sheetVisible = effectiveSheetVisible(defaultSheetVisible, override);
    const rootWithUpgrades =
      task.kind === 'FEATURE'
        ? task.feature
        : task.kind === 'CHOICE_OPTION'
          ? task.option
          : null;
    const effectiveUpgrade = rootWithUpgrades
      ? effectiveUpgradeForRoot(rootWithUpgrades.upgrades, context)
      : null;
    const baseName =
      task.kind === 'ADDITIONAL_REWARD'
        ? additionalRewardDisplayName(task.reward!)
        : rewardDisplayName(
            task.kind === 'FEATURE' ? task.feature! : task.option!,
          );
    const baseDescription =
      task.kind === 'ADDITIONAL_REWARD'
        ? additionalRewardDisplayDescription(task.reward!)
        : rewardDisplayDescription(
            task.kind === 'FEATURE' ? task.feature! : task.option!,
          );
    const upgradeBranch = effectiveUpgrade
      ? branchMetadata(effectiveUpgrade.branchOption, context.activeBranches)
      : null;
    const ownerName =
      context.sourceType === 'SUBCLASS' && context.sourceSubclassName
        ? `${context.sourceClassName} - ${context.sourceSubclassName}`
        : context.sourceClassName;

    const entry: AutomaticCharacterClassFeature = {
      id: `${task.kind.toLowerCase()}:${context.characterClassId}:${task.key}`,
      definitionId:
        task.kind === 'FEATURE'
          ? task.feature!.id
          : task.kind === 'CHOICE_OPTION'
            ? task.option!.id
            : task.reward!.id,
      target: target,
      name: effectiveUpgrade?.name?.trim() || baseName,
      description: effectiveUpgrade?.description ?? baseDescription,
      level: sourceLevel,
      order:
        task.kind === 'FEATURE'
          ? (task.feature?.order ?? 0)
          : task.kind === 'CHOICE_OPTION'
            ? (task.option?.order ?? task.group?.order ?? 0)
            : (task.reward?.order ?? 0),
      sourceType: context.sourceType,
      sourceClassId: context.sourceClassId,
      sourceClassName: context.sourceClassName,
      sourceSubclassId: context.sourceSubclassId ?? null,
      sourceSubclassName: context.sourceSubclassName ?? null,
      sourceLabel: task.sourceLabel,
      acquisitionType: task.acquisitionType,
      definitionKind: task.kind,
      branchGroupId: branch.branchGroupId,
      branchGroupName: branch.branchGroupName,
      branchOptionId: branch.branchOptionId,
      branchOptionName: branch.branchOptionName,
      choiceGroupId: task.group?.id ?? null,
      choiceGroupName: task.group?.name ?? null,
      choiceOptionId: task.option?.id ?? null,
      skillEntryId:
        task.kind === 'ADDITIONAL_REWARD'
          ? (task.reward?.skillEntryId ?? null)
          : ((task.kind === 'FEATURE' ? task.feature : task.option)
              ?.skillEntryId ?? null),
      spellEntryId:
        task.kind === 'ADDITIONAL_REWARD'
          ? (task.reward?.spellEntryId ?? null)
          : ((task.kind === 'FEATURE' ? task.feature : task.option)
              ?.spellEntryId ?? null),
      skillEntry:
        task.kind === 'ADDITIONAL_REWARD'
          ? (task.reward?.skillEntry ?? null)
          : ((task.kind === 'FEATURE' ? task.feature : task.option)
              ?.skillEntry ?? null),
      spellEntry:
        task.kind === 'ADDITIONAL_REWARD'
          ? (task.reward?.spellEntry ?? null)
          : ((task.kind === 'FEATURE' ? task.feature : task.option)
              ?.spellEntry ?? null),
      sourcePath: task.sourcePath,
      sources: [],
      rootDefinitionId:
        task.kind === 'FEATURE'
          ? task.feature!.id
          : task.kind === 'CHOICE_OPTION'
            ? task.option!.id
            : task.reward!.id,
      effectiveUpgradeId: effectiveUpgrade?.id ?? null,
      effectiveUpgradeUnlockLevel: effectiveUpgrade?.unlockLevel ?? null,
      effectiveUpgradeName: effectiveUpgrade?.name ?? null,
      effectiveUpgradeSourceLabel: effectiveUpgrade
        ? `${ownerName}${upgradeBranch?.sourceSuffix ?? ''} Lv.${effectiveUpgrade.unlockLevel} 강화`
        : null,
      effectiveUpgradeBranchOptionId: effectiveUpgrade?.branchOptionId ?? null,
      effectiveUpgradeBranchOptionName:
        effectiveUpgrade?.branchOption?.name ?? null,
      featureOverrideId: override?.id ?? null,
      visibilityOverride: override?.visibility ?? 'DEFAULT',
      suppressed,
      overrideNote: override?.note ?? null,
      defaultSheetVisible,
      effectiveSheetVisible: sheetVisible,
    };
    entry.sources = [referenceFromTask(task, entry)];
    byDefinitionKey.set(task.key, entry);

    if (suppressed) return;
    resolving.add(task.key);
    if (task.kind === 'FEATURE') {
      enqueueAdditionalRewards(task.feature?.additionalRewards, task);
    } else if (task.kind === 'CHOICE_OPTION') {
      enqueueAdditionalRewards(task.option?.additionalRewards, task);
    }
    resolving.delete(task.key);
  };

  while (tasks.length) {
    const task = tasks.shift();
    if (task) resolveTask(task);
  }

  return [...byDefinitionKey.values()].sort(sortAutomaticFeatures);
}

export function calculateAutomaticClassTechniques(
  automaticFeatures: AutomaticCharacterClassFeature[],
): AutomaticClassTechnique[] {
  const bySkillId = new Map<number, AutomaticClassTechnique>();
  for (const feature of automaticFeatures) {
    if (feature.suppressed || feature.effectiveSheetVisible === false) continue;
    if (feature.target !== 'TECHNIQUE' || !feature.skillEntry) continue;
    const skill = feature.skillEntry;
    const current = bySkillId.get(skill.id);
    if (current) {
      current.sources.push(referenceSource(feature));
      continue;
    }
    bySkillId.set(skill.id, {
      id: `skill:${skill.id}`,
      skillEntryId: skill.id,
      skillKey: skill.skillKey,
      skillName: skill.skillName,
      jobName: skill.jobName,
      conditionText: skill.conditionText ?? null,
      titleRaw: skill.titleRaw,
      bodyRaw: skill.bodyRaw,
      sources: [referenceSource(feature)],
    });
  }
  return [...bySkillId.values()].sort((a, b) =>
    a.skillName.localeCompare(b.skillName, 'ko'),
  );
}

export function calculateAutomaticClassSpells(
  automaticFeatures: AutomaticCharacterClassFeature[],
): AutomaticClassSpell[] {
  const bySpellId = new Map<number, AutomaticClassSpell>();
  for (const feature of automaticFeatures) {
    if (feature.suppressed || feature.effectiveSheetVisible === false) continue;
    if (feature.target !== 'SPELL' || !feature.spellEntry) continue;
    const spell = feature.spellEntry;
    const current = bySpellId.get(spell.id);
    if (current) {
      current.sources.push(referenceSource(feature));
      continue;
    }
    bySpellId.set(spell.id, {
      id: `spell:${spell.id}`,
      spellEntryId: spell.id,
      spellKey: spell.spellKey,
      spellLevel: spell.spellLevel,
      spellNumber: spell.spellNumber ?? null,
      spellName: spell.spellName,
      titleRaw: spell.titleRaw,
      school: spell.school ?? null,
      bodyRaw: spell.bodyRaw,
      sources: [referenceSource(feature)],
    });
  }
  return [...bySpellId.values()].sort(
    (a, b) =>
      a.spellLevel.localeCompare(b.spellLevel, 'ko') ||
      (a.spellNumber ?? 9999) - (b.spellNumber ?? 9999) ||
      a.spellName.localeCompare(b.spellName, 'ko'),
  );
}
