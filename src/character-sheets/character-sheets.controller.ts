import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import { AuthGuard } from '../auth/auth.guard';
import { CharacterSheetsService } from './character-sheets.service';

@Controller('character-sheets')
export class CharacterSheetsController {
  constructor(private readonly sheets: CharacterSheetsService) {}

  @Get('slots')
  @UseGuards(AuthGuard)
  getSlots() {
    return this.sheets.getEquipmentSlots();
  }

  @Get('item-profiles')
  @UseGuards(AuthGuard)
  listItemProfiles(
    @Query('query') query?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    if (query !== undefined || page !== undefined || pageSize !== undefined) {
      return this.sheets.searchItemProfiles({ query, page, pageSize });
    }
    return this.sheets.listItemProfiles();
  }

  @Get('item-profiles/:itemName')
  @UseGuards(AuthGuard)
  getItemProfile(@Param('itemName') itemName: string) {
    return this.sheets.getItemProfile(itemName);
  }

  @Post('item-profiles')
  @UseGuards(AuthGuard, AdminGuard)
  upsertItemProfile(
    @Body()
    body: {
      itemName?: string;
      allowedSlots?: unknown;
      occupiesSlots?: unknown;
      effects?: unknown;
      flavorText?: string | null;
      metadata?: string | null;
      notes?: string | null;
    },
  ) {
    return this.sheets.upsertItemProfile(body);
  }

  @Get('class-definitions')
  @UseGuards(AuthGuard)
  listClassDefinitions() {
    return this.sheets.listClassDefinitions();
  }

  @Get('reference/skills')
  @UseGuards(AuthGuard)
  searchSkillReferences(
    @Query('query') query?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.sheets.searchSkillReferences({ query, pageSize });
  }

  @Get('reference/spells')
  @UseGuards(AuthGuard)
  searchSpellReferences(
    @Query('query') query?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.sheets.searchSpellReferences({ query, pageSize });
  }

  @Post('reference/skills')
  @UseGuards(AuthGuard, AdminGuard)
  createSkillReference(@Body() body: Record<string, unknown>) {
    return this.sheets.createSkillReference(body);
  }

  @Patch('reference/skills/:skillEntryId')
  @UseGuards(AuthGuard, AdminGuard)
  updateSkillReference(
    @Param('skillEntryId') skillEntryId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.sheets.updateSkillReference(skillEntryId, body);
  }

  @Post('reference/spells')
  @UseGuards(AuthGuard, AdminGuard)
  createSpellReference(@Body() body: Record<string, unknown>) {
    return this.sheets.createSpellReference(body);
  }

  @Patch('reference/spells/:spellEntryId')
  @UseGuards(AuthGuard, AdminGuard)
  updateSpellReference(
    @Param('spellEntryId') spellEntryId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.sheets.updateSpellReference(spellEntryId, body);
  }

  @Post('class-definitions')
  @UseGuards(AuthGuard, AdminGuard)
  createClassDefinition(
    @Body()
    body: {
      name?: string;
      subclassChoiceLevel?: unknown;
      casterProgression?: unknown;
    },
  ) {
    return this.sheets.createClassDefinition(body);
  }

  @Patch('class-definitions/:classDefinitionId')
  @UseGuards(AuthGuard, AdminGuard)
  updateClassDefinition(
    @Param('classDefinitionId') classDefinitionId: string,
    @Body()
    body: {
      name?: string;
      subclassChoiceLevel?: unknown;
      casterProgression?: unknown;
    },
  ) {
    return this.sheets.updateClassDefinition(classDefinitionId, body);
  }

  @Delete('class-definitions/:classDefinitionId')
  @UseGuards(AuthGuard, AdminGuard)
  deleteClassDefinition(@Param('classDefinitionId') classDefinitionId: string) {
    return this.sheets.deleteClassDefinition(classDefinitionId);
  }

  @Post('class-definitions/:classDefinitionId/subclasses')
  @UseGuards(AuthGuard, AdminGuard)
  createSubclassDefinition(
    @Param('classDefinitionId') classDefinitionId: string,
    @Body() body: { name?: string },
  ) {
    return this.sheets.createSubclassDefinition(classDefinitionId, body);
  }

  @Post('class-definitions/:classDefinitionId/features')
  @UseGuards(AuthGuard, AdminGuard)
  createClassFeatureDefinition(
    @Param('classDefinitionId') classDefinitionId: string,
    @Body()
    body: {
      level?: unknown;
      name?: string;
      description?: string;
      target?: unknown;
      order?: unknown;
      branchOptionId?: unknown;
      skillEntryId?: unknown;
      spellEntryId?: unknown;
    },
  ) {
    return this.sheets.createClassFeatureDefinition(classDefinitionId, body);
  }

  @Post('class-definitions/:classDefinitionId/choice-groups')
  @UseGuards(AuthGuard, AdminGuard)
  createClassChoiceGroup(
    @Param('classDefinitionId') classDefinitionId: string,
    @Body()
    body: {
      level?: unknown;
      name?: unknown;
      description?: unknown;
      selectionCount?: unknown;
      order?: unknown;
      branchOptionId?: unknown;
    },
  ) {
    return this.sheets.createClassChoiceGroup(classDefinitionId, body);
  }

  @Post('class-definitions/:classDefinitionId/branch-groups')
  @UseGuards(AuthGuard, AdminGuard)
  createClassBranchGroup(
    @Param('classDefinitionId') classDefinitionId: string,
    @Body()
    body: {
      name?: unknown;
      description?: unknown;
      unlockLevel?: unknown;
      displayOrder?: unknown;
    },
  ) {
    return this.sheets.createClassBranchGroup(classDefinitionId, body);
  }

  @Patch('subclass-definitions/:subclassDefinitionId')
  @UseGuards(AuthGuard, AdminGuard)
  updateSubclassDefinition(
    @Param('subclassDefinitionId') subclassDefinitionId: string,
    @Body() body: { name?: string },
  ) {
    return this.sheets.updateSubclassDefinition(subclassDefinitionId, body);
  }

  @Delete('subclass-definitions/:subclassDefinitionId')
  @UseGuards(AuthGuard, AdminGuard)
  deleteSubclassDefinition(
    @Param('subclassDefinitionId') subclassDefinitionId: string,
  ) {
    return this.sheets.deleteSubclassDefinition(subclassDefinitionId);
  }

  @Post('subclass-definitions/:subclassDefinitionId/features')
  @UseGuards(AuthGuard, AdminGuard)
  createSubclassFeatureDefinition(
    @Param('subclassDefinitionId') subclassDefinitionId: string,
    @Body()
    body: {
      level?: unknown;
      name?: string;
      description?: string;
      target?: unknown;
      order?: unknown;
      branchOptionId?: unknown;
      skillEntryId?: unknown;
      spellEntryId?: unknown;
    },
  ) {
    return this.sheets.createSubclassFeatureDefinition(
      subclassDefinitionId,
      body,
    );
  }

  @Post('subclass-definitions/:subclassDefinitionId/choice-groups')
  @UseGuards(AuthGuard, AdminGuard)
  createSubclassChoiceGroup(
    @Param('subclassDefinitionId') subclassDefinitionId: string,
    @Body()
    body: {
      level?: unknown;
      name?: unknown;
      description?: unknown;
      selectionCount?: unknown;
      order?: unknown;
      branchOptionId?: unknown;
    },
  ) {
    return this.sheets.createSubclassChoiceGroup(subclassDefinitionId, body);
  }

  @Post('subclass-definitions/:subclassDefinitionId/branch-groups')
  @UseGuards(AuthGuard, AdminGuard)
  createSubclassBranchGroup(
    @Param('subclassDefinitionId') subclassDefinitionId: string,
    @Body()
    body: {
      name?: unknown;
      description?: unknown;
      unlockLevel?: unknown;
      displayOrder?: unknown;
    },
  ) {
    return this.sheets.createSubclassBranchGroup(subclassDefinitionId, body);
  }

  @Patch('class-feature-definitions/:classFeatureDefinitionId')
  @UseGuards(AuthGuard, AdminGuard)
  updateClassFeatureDefinition(
    @Param('classFeatureDefinitionId') classFeatureDefinitionId: string,
    @Body()
    body: {
      level?: unknown;
      name?: string;
      description?: string;
      target?: unknown;
      order?: unknown;
      branchOptionId?: unknown;
      skillEntryId?: unknown;
      spellEntryId?: unknown;
    },
  ) {
    return this.sheets.updateClassFeatureDefinition(
      classFeatureDefinitionId,
      body,
    );
  }

  @Delete('class-feature-definitions/:classFeatureDefinitionId')
  @UseGuards(AuthGuard, AdminGuard)
  deleteClassFeatureDefinition(
    @Param('classFeatureDefinitionId') classFeatureDefinitionId: string,
  ) {
    return this.sheets.deleteClassFeatureDefinition(classFeatureDefinitionId);
  }

  @Post(
    'class-feature-definitions/:classFeatureDefinitionId/additional-rewards',
  )
  @UseGuards(AuthGuard, AdminGuard)
  createClassFeatureAdditionalReward(
    @Param('classFeatureDefinitionId') classFeatureDefinitionId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.sheets.createClassFeatureAdditionalReward(
      classFeatureDefinitionId,
      body,
    );
  }

  @Patch('class-choice-groups/:choiceGroupId')
  @UseGuards(AuthGuard, AdminGuard)
  updateChoiceGroup(
    @Param('choiceGroupId') choiceGroupId: string,
    @Body()
    body: {
      level?: unknown;
      name?: unknown;
      description?: unknown;
      selectionCount?: unknown;
      order?: unknown;
      branchOptionId?: unknown;
    },
  ) {
    return this.sheets.updateChoiceGroup(choiceGroupId, body);
  }

  @Patch('progression-branch-groups/:branchGroupId')
  @UseGuards(AuthGuard, AdminGuard)
  updateBranchGroup(
    @Param('branchGroupId') branchGroupId: string,
    @Body()
    body: {
      name?: unknown;
      description?: unknown;
      unlockLevel?: unknown;
      displayOrder?: unknown;
    },
  ) {
    return this.sheets.updateBranchGroup(branchGroupId, body);
  }

  @Delete('progression-branch-groups/:branchGroupId')
  @UseGuards(AuthGuard, AdminGuard)
  deleteBranchGroup(@Param('branchGroupId') branchGroupId: string) {
    return this.sheets.deleteBranchGroup(branchGroupId);
  }

  @Post('progression-branch-groups/:branchGroupId/options')
  @UseGuards(AuthGuard, AdminGuard)
  createBranchOption(
    @Param('branchGroupId') branchGroupId: string,
    @Body()
    body: {
      name?: unknown;
      description?: unknown;
      displayOrder?: unknown;
    },
  ) {
    return this.sheets.createBranchOption(branchGroupId, body);
  }

  @Patch('progression-branch-options/:branchOptionId')
  @UseGuards(AuthGuard, AdminGuard)
  updateBranchOption(
    @Param('branchOptionId') branchOptionId: string,
    @Body()
    body: {
      name?: unknown;
      description?: unknown;
      displayOrder?: unknown;
    },
  ) {
    return this.sheets.updateBranchOption(branchOptionId, body);
  }

  @Delete('progression-branch-options/:branchOptionId')
  @UseGuards(AuthGuard, AdminGuard)
  deleteBranchOption(@Param('branchOptionId') branchOptionId: string) {
    return this.sheets.deleteBranchOption(branchOptionId);
  }

  @Delete('class-choice-groups/:choiceGroupId')
  @UseGuards(AuthGuard, AdminGuard)
  deleteChoiceGroup(@Param('choiceGroupId') choiceGroupId: string) {
    return this.sheets.deleteChoiceGroup(choiceGroupId);
  }

  @Post('class-choice-groups/:choiceGroupId/options')
  @UseGuards(AuthGuard, AdminGuard)
  createChoiceOption(
    @Param('choiceGroupId') choiceGroupId: string,
    @Body()
    body: {
      name?: string;
      description?: string;
      target?: unknown;
      order?: unknown;
      skillEntryId?: unknown;
      spellEntryId?: unknown;
    },
  ) {
    return this.sheets.createChoiceOption(choiceGroupId, body);
  }

  @Patch('class-choice-options/:choiceOptionId')
  @UseGuards(AuthGuard, AdminGuard)
  updateChoiceOption(
    @Param('choiceOptionId') choiceOptionId: string,
    @Body()
    body: {
      name?: string;
      description?: string;
      target?: unknown;
      order?: unknown;
      skillEntryId?: unknown;
      spellEntryId?: unknown;
    },
  ) {
    return this.sheets.updateChoiceOption(choiceOptionId, body);
  }

  @Post('class-choice-options/:choiceOptionId/additional-rewards')
  @UseGuards(AuthGuard, AdminGuard)
  createChoiceOptionAdditionalReward(
    @Param('choiceOptionId') choiceOptionId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.sheets.createChoiceOptionAdditionalReward(choiceOptionId, body);
  }

  @Patch('class-additional-rewards/:additionalRewardId')
  @UseGuards(AuthGuard, AdminGuard)
  updateAdditionalReward(
    @Param('additionalRewardId') additionalRewardId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.sheets.updateAdditionalReward(additionalRewardId, body);
  }

  @Delete('class-additional-rewards/:additionalRewardId')
  @UseGuards(AuthGuard, AdminGuard)
  deleteAdditionalReward(
    @Param('additionalRewardId') additionalRewardId: string,
  ) {
    return this.sheets.deleteAdditionalReward(additionalRewardId);
  }

  @Post('class-feature-upgrades')
  @UseGuards(AuthGuard, AdminGuard)
  createFeatureUpgrade(@Body() body: Record<string, unknown>) {
    return this.sheets.createFeatureUpgrade(body);
  }

  @Patch('class-feature-upgrades/:upgradeId')
  @UseGuards(AuthGuard, AdminGuard)
  updateFeatureUpgrade(
    @Param('upgradeId') upgradeId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.sheets.updateFeatureUpgrade(upgradeId, body);
  }

  @Delete('class-feature-upgrades/:upgradeId')
  @UseGuards(AuthGuard, AdminGuard)
  deleteFeatureUpgrade(@Param('upgradeId') upgradeId: string) {
    return this.sheets.deleteFeatureUpgrade(upgradeId);
  }

  @Delete('class-choice-options/:choiceOptionId')
  @UseGuards(AuthGuard, AdminGuard)
  deleteChoiceOption(@Param('choiceOptionId') choiceOptionId: string) {
    return this.sheets.deleteChoiceOption(choiceOptionId);
  }

  @Get(':name')
  @UseGuards(AuthGuard)
  getDetail(@Param('name') name: string) {
    return this.sheets.getDetail(name);
  }

  @Patch(':name')
  @UseGuards(AuthGuard, AdminGuard)
  updateSheet(
    @Param('name') name: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.sheets.updateSheet(name, body);
  }

  @Post(':name/classes')
  @UseGuards(AuthGuard, AdminGuard)
  createCharacterClass(
    @Param('name') name: string,
    @Body()
    body: {
      classDefinitionId?: string;
      subclassDefinitionId?: string | null;
      level?: unknown;
    },
  ) {
    return this.sheets.createCharacterClass(name, body);
  }

  @Patch(':name/classes/:characterClassId')
  @UseGuards(AuthGuard, AdminGuard)
  updateCharacterClass(
    @Param('name') name: string,
    @Param('characterClassId') characterClassId: string,
    @Body()
    body: {
      classDefinitionId?: string;
      subclassDefinitionId?: string | null;
      level?: unknown;
    },
  ) {
    return this.sheets.updateCharacterClass(name, characterClassId, body);
  }

  @Patch(':name/classes/:characterClassId/choice-groups/:choiceGroupId')
  @UseGuards(AuthGuard, AdminGuard)
  setCharacterClassChoiceSelections(
    @Param('name') name: string,
    @Param('characterClassId') characterClassId: string,
    @Param('choiceGroupId') choiceGroupId: string,
    @Body() body: { choiceOptionIds?: unknown },
  ) {
    return this.sheets.setCharacterClassChoiceSelections(
      name,
      characterClassId,
      choiceGroupId,
      body,
    );
  }

  @Patch(':name/classes/:characterClassId/branch-groups/:branchGroupId')
  @UseGuards(AuthGuard, AdminGuard)
  setCharacterClassBranchSelection(
    @Param('name') name: string,
    @Param('characterClassId') characterClassId: string,
    @Param('branchGroupId') branchGroupId: string,
    @Body() body: { branchOptionId?: unknown },
  ) {
    return this.sheets.setCharacterClassBranchSelection(
      name,
      characterClassId,
      branchGroupId,
      body,
    );
  }

  @Delete(':name/classes/:characterClassId')
  @UseGuards(AuthGuard, AdminGuard)
  deleteCharacterClass(
    @Param('name') name: string,
    @Param('characterClassId') characterClassId: string,
  ) {
    return this.sheets.deleteCharacterClass(name, characterClassId);
  }

  @Patch(':name/feature-overrides')
  @UseGuards(AuthGuard, AdminGuard)
  updateCharacterFeatureOverride(
    @Param('name') name: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.sheets.updateCharacterFeatureOverride(name, body);
  }

  @Post(':name/equipment')
  @UseGuards(AuthGuard, AdminGuard)
  equipItem(
    @Param('name') name: string,
    @Body() body: { itemName?: string; slotKey?: string },
  ) {
    return this.sheets.equipItem(name, body);
  }

  @Delete(':name/equipment/:equipmentId')
  @UseGuards(AuthGuard, AdminGuard)
  unequipItem(
    @Param('name') name: string,
    @Param('equipmentId') equipmentId: string,
  ) {
    return this.sheets.unequipItem(name, equipmentId);
  }

  @Post(':name/features')
  @UseGuards(AuthGuard, AdminGuard)
  createFeature(
    @Param('name') name: string,
    @Body()
    body: {
      kind?: string;
      name?: string;
      description?: string;
      order?: number;
    },
  ) {
    return this.sheets.createFeature(name, body);
  }

  @Patch(':name/features/:featureId')
  @UseGuards(AuthGuard, AdminGuard)
  updateFeature(
    @Param('name') name: string,
    @Param('featureId') featureId: string,
    @Body()
    body: {
      kind?: string;
      name?: string;
      description?: string;
      order?: number;
    },
  ) {
    return this.sheets.updateFeature(name, featureId, body);
  }

  @Delete(':name/features/:featureId')
  @UseGuards(AuthGuard, AdminGuard)
  deleteFeature(
    @Param('name') name: string,
    @Param('featureId') featureId: string,
  ) {
    return this.sheets.deleteFeature(name, featureId);
  }
}
