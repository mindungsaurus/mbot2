import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import { AuthGuard } from '../auth/auth.guard';
import { CapabilityGuard } from '../auth/capability.guard';
import { RequireCapability } from '../auth/capability.decorator';
import type { AuthRequest } from '../auth/auth.types';
import type {
  ActorRuleListQuery,
  AnalysisJobListQuery,
  CancelAnalysisJobBody,
  CreateActorRuleBody,
  CreateCampaignBody,
  CreateCampaignParticipantBody,
  CreateDiscordLogSourceBody,
  DiscordCollectionBody,
  DiscordCollectionRunListQuery,
  CreateLogSourceCoverageBody,
  CreatePersonAliasBody,
  CreatePersonBody,
  CreateSmokeAnalysisJobBody,
  CreateStoryTimeAnchorBody,
  LogSourceCoverageListQuery,
  PersonListQuery,
  StoryTimeAnchorListQuery,
  StoryTimeAtQuery,
  UpdateActorRuleBody,
  UpdateAffinityBody,
  UpdateCampaignBody,
  UpdateCampaignParticipantBody,
  UpdateDiscordLogSourceBody,
  UpdateLogSourceCoverageBody,
  UpdatePersonAliasBody,
  UpdatePersonBody,
  UpdateStoryTimeAnchorBody,
  UpsertAffinityBody,
} from './session-archive.dto';
import { SessionArchiveAiService } from './session-archive-ai.service';
import { SessionArchiveCollectionService } from './session-archive-collection.service';
import { SessionArchiveService } from './session-archive.service';

@Controller('session-archive')
export class SessionArchiveController {
  constructor(
    private readonly archive: SessionArchiveService,
    private readonly collection: SessionArchiveCollectionService,
    private readonly ai: SessionArchiveAiService,
  ) {}

  @Get('campaigns')
  @UseGuards(AuthGuard)
  listCampaigns() {
    return this.archive.listCampaigns();
  }

  @Get('campaigns/:campaignId')
  @UseGuards(AuthGuard)
  getCampaign(@Param('campaignId') campaignId: string) {
    return this.archive.getCampaign(campaignId);
  }

  @Post('campaigns')
  @UseGuards(AuthGuard, AdminGuard)
  createCampaign(@Body() body: CreateCampaignBody) {
    return this.archive.createCampaign(body);
  }

  @Patch('campaigns/:campaignId')
  @UseGuards(AuthGuard, AdminGuard)
  updateCampaign(
    @Param('campaignId') campaignId: string,
    @Body() body: UpdateCampaignBody,
  ) {
    return this.archive.updateCampaign(campaignId, body);
  }

  @Delete('campaigns/:campaignId')
  @UseGuards(AuthGuard, AdminGuard)
  deactivateCampaign(@Param('campaignId') campaignId: string) {
    return this.archive.deactivateCampaign(campaignId);
  }

  @Get('campaigns/:campaignId/persons')
  @UseGuards(AuthGuard)
  listPersons(
    @Param('campaignId') campaignId: string,
    @Query() query: PersonListQuery,
  ) {
    return this.archive.listPersons(campaignId, query);
  }

  @Post('campaigns/:campaignId/persons')
  @UseGuards(AuthGuard, AdminGuard)
  createPerson(
    @Param('campaignId') campaignId: string,
    @Body() body: CreatePersonBody,
  ) {
    return this.archive.createPerson(campaignId, body);
  }

  @Get('persons/:personId')
  @UseGuards(AuthGuard)
  getPerson(@Param('personId') personId: string) {
    return this.archive.getPerson(personId);
  }

  @Patch('persons/:personId')
  @UseGuards(AuthGuard, AdminGuard)
  updatePerson(
    @Param('personId') personId: string,
    @Body() body: UpdatePersonBody,
  ) {
    return this.archive.updatePerson(personId, body);
  }

  @Delete('persons/:personId')
  @UseGuards(AuthGuard, AdminGuard)
  deactivatePerson(@Param('personId') personId: string) {
    return this.archive.deactivatePerson(personId);
  }

  @Get('persons/:personId/aliases')
  @UseGuards(AuthGuard)
  listPersonAliases(@Param('personId') personId: string) {
    return this.archive.listPersonAliases(personId);
  }

  @Post('persons/:personId/aliases')
  @UseGuards(AuthGuard, AdminGuard)
  createPersonAlias(
    @Param('personId') personId: string,
    @Body() body: CreatePersonAliasBody,
  ) {
    return this.archive.createPersonAlias(personId, body);
  }

  @Patch('person-aliases/:aliasId')
  @UseGuards(AuthGuard, AdminGuard)
  updatePersonAlias(
    @Param('aliasId') aliasId: string,
    @Body() body: UpdatePersonAliasBody,
  ) {
    return this.archive.updatePersonAlias(aliasId, body);
  }

  @Delete('person-aliases/:aliasId')
  @UseGuards(AuthGuard, AdminGuard)
  deletePersonAlias(@Param('aliasId') aliasId: string) {
    return this.archive.deletePersonAlias(aliasId);
  }

  @Get('persons/:personId/affinities')
  @UseGuards(AuthGuard)
  listAffinities(@Param('personId') personId: string) {
    return this.archive.listAffinities(personId);
  }

  @Put('affinities')
  @UseGuards(AuthGuard, AdminGuard)
  upsertAffinity(@Body() body: UpsertAffinityBody) {
    return this.archive.upsertAffinity(body);
  }

  @Patch('affinities/:affinityId')
  @UseGuards(AuthGuard, AdminGuard)
  updateAffinity(
    @Param('affinityId') affinityId: string,
    @Body() body: UpdateAffinityBody,
  ) {
    return this.archive.updateAffinity(affinityId, body);
  }

  @Delete('affinities/:affinityId')
  @UseGuards(AuthGuard, AdminGuard)
  deleteAffinity(@Param('affinityId') affinityId: string) {
    return this.archive.deleteAffinity(affinityId);
  }

  @Get('campaigns/:campaignId/participants')
  @UseGuards(AuthGuard)
  listCampaignParticipants(@Param('campaignId') campaignId: string) {
    return this.archive.listCampaignParticipants(campaignId);
  }

  @Post('campaigns/:campaignId/participants')
  @UseGuards(AuthGuard, AdminGuard)
  createCampaignParticipant(
    @Param('campaignId') campaignId: string,
    @Body() body: CreateCampaignParticipantBody,
  ) {
    return this.archive.createCampaignParticipant(campaignId, body);
  }

  @Patch('participants/:participantId')
  @UseGuards(AuthGuard, AdminGuard)
  updateCampaignParticipant(
    @Param('participantId') participantId: string,
    @Body() body: UpdateCampaignParticipantBody,
  ) {
    return this.archive.updateCampaignParticipant(participantId, body);
  }

  @Delete('participants/:participantId')
  @UseGuards(AuthGuard, AdminGuard)
  deleteCampaignParticipant(@Param('participantId') participantId: string) {
    return this.archive.deleteCampaignParticipant(participantId);
  }

  @Get('campaigns/:campaignId/log-sources')
  @UseGuards(AuthGuard)
  listLogSources(@Param('campaignId') campaignId: string) {
    return this.archive.listLogSources(campaignId);
  }

  @Post('campaigns/:campaignId/log-sources')
  @UseGuards(AuthGuard, AdminGuard)
  createLogSource(
    @Param('campaignId') campaignId: string,
    @Body() body: CreateDiscordLogSourceBody,
  ) {
    return this.archive.createLogSource(campaignId, body);
  }

  @Get('log-sources/:logSourceId')
  @UseGuards(AuthGuard)
  getLogSource(@Param('logSourceId') logSourceId: string) {
    return this.archive.getLogSource(logSourceId);
  }

  @Patch('log-sources/:logSourceId')
  @UseGuards(AuthGuard, AdminGuard)
  updateLogSource(
    @Param('logSourceId') logSourceId: string,
    @Body() body: UpdateDiscordLogSourceBody,
  ) {
    return this.archive.updateLogSource(logSourceId, body);
  }

  @Delete('log-sources/:logSourceId')
  @UseGuards(AuthGuard, AdminGuard)
  disableLogSource(@Param('logSourceId') logSourceId: string) {
    return this.archive.disableLogSource(logSourceId);
  }

  @Post('log-sources/:logSourceId/collection-preview')
  @UseGuards(AuthGuard, AdminGuard)
  previewLogSourceCollection(
    @Param('logSourceId') logSourceId: string,
    @Body() body: DiscordCollectionBody,
  ) {
    return this.collection.previewLogSourceCollection(logSourceId, body);
  }

  @Post('log-sources/:logSourceId/collect')
  @UseGuards(AuthGuard, AdminGuard)
  collectLogSource(
    @Param('logSourceId') logSourceId: string,
    @Body() body: DiscordCollectionBody,
    @Req() req: AuthRequest,
  ) {
    return this.collection.collectLogSource(logSourceId, body, req.user.id);
  }

  @Get('log-sources/:logSourceId/collection-runs')
  @UseGuards(AuthGuard)
  listCollectionRuns(
    @Param('logSourceId') logSourceId: string,
    @Query() query: DiscordCollectionRunListQuery,
  ) {
    return this.collection.listCollectionRuns(logSourceId, query);
  }

  @Get('collection-runs/:runId')
  @UseGuards(AuthGuard)
  getCollectionRun(@Param('runId') runId: string) {
    return this.collection.getCollectionRun(runId);
  }

  @Get('story-time-anchors')
  @UseGuards(AuthGuard)
  listStoryTimeAnchors(@Query() query: StoryTimeAnchorListQuery) {
    return this.archive.listStoryTimeAnchors(query);
  }

  @Get('log-sources/:logSourceId/story-time-at')
  @UseGuards(AuthGuard)
  findStoryTimeAt(
    @Param('logSourceId') logSourceId: string,
    @Query() query: StoryTimeAtQuery,
  ) {
    return this.archive.findStoryTimeForSourceTimestamp(
      logSourceId,
      query.timestamp,
    );
  }

  @Post('campaigns/:campaignId/story-time-anchors')
  @UseGuards(AuthGuard, AdminGuard)
  createStoryTimeAnchor(
    @Param('campaignId') campaignId: string,
    @Body() body: CreateStoryTimeAnchorBody,
  ) {
    return this.archive.createStoryTimeAnchor(campaignId, body);
  }

  @Patch('story-time-anchors/:anchorId')
  @UseGuards(AuthGuard, AdminGuard)
  updateStoryTimeAnchor(
    @Param('anchorId') anchorId: string,
    @Body() body: UpdateStoryTimeAnchorBody,
  ) {
    return this.archive.updateStoryTimeAnchor(anchorId, body);
  }

  @Delete('story-time-anchors/:anchorId')
  @UseGuards(AuthGuard, AdminGuard)
  deleteStoryTimeAnchor(@Param('anchorId') anchorId: string) {
    return this.archive.deleteStoryTimeAnchor(anchorId);
  }

  @Get('campaigns/:campaignId/actor-rules')
  @UseGuards(AuthGuard)
  listActorRules(
    @Param('campaignId') campaignId: string,
    @Query() query: ActorRuleListQuery,
  ) {
    return this.archive.listActorRules(campaignId, query);
  }

  @Post('campaigns/:campaignId/actor-rules')
  @UseGuards(AuthGuard, AdminGuard)
  createActorRule(
    @Param('campaignId') campaignId: string,
    @Body() body: CreateActorRuleBody,
  ) {
    return this.archive.createActorRule(campaignId, body);
  }

  @Patch('actor-rules/:ruleId')
  @UseGuards(AuthGuard, AdminGuard)
  updateActorRule(
    @Param('ruleId') ruleId: string,
    @Body() body: UpdateActorRuleBody,
  ) {
    return this.archive.updateActorRule(ruleId, body);
  }

  @Delete('actor-rules/:ruleId')
  @UseGuards(AuthGuard, AdminGuard)
  disableActorRule(@Param('ruleId') ruleId: string) {
    return this.archive.disableActorRule(ruleId);
  }

  @Get('log-sources/:logSourceId/coverages')
  @UseGuards(AuthGuard)
  listLogSourceCoverages(
    @Param('logSourceId') logSourceId: string,
    @Query() query: LogSourceCoverageListQuery,
  ) {
    return this.archive.listLogSourceCoverages(logSourceId, query);
  }

  @Post('log-sources/:logSourceId/coverages')
  @UseGuards(AuthGuard, AdminGuard)
  createLogSourceCoverage(
    @Param('logSourceId') logSourceId: string,
    @Body() body: CreateLogSourceCoverageBody,
  ) {
    return this.archive.createLogSourceCoverage(logSourceId, body);
  }

  @Patch('coverages/:coverageId')
  @UseGuards(AuthGuard, AdminGuard)
  updateLogSourceCoverage(
    @Param('coverageId') coverageId: string,
    @Body() body: UpdateLogSourceCoverageBody,
  ) {
    return this.archive.updateLogSourceCoverage(coverageId, body);
  }

  @Delete('coverages/:coverageId')
  @UseGuards(AuthGuard, AdminGuard)
  deleteLogSourceCoverage(@Param('coverageId') coverageId: string) {
    return this.archive.deleteLogSourceCoverage(coverageId);
  }

  @Get('ai/jobs')
  @UseGuards(AuthGuard, AdminGuard)
  listAnalysisJobs(@Query() query: AnalysisJobListQuery) {
    return this.ai.listJobs(query);
  }

  @Get('ai/jobs/:jobId')
  @UseGuards(AuthGuard, AdminGuard)
  getAnalysisJob(@Param('jobId') jobId: string) {
    return this.ai.getJob(jobId);
  }

  @Get('ai/tasks/:taskId')
  @UseGuards(AuthGuard, AdminGuard)
  getAnalysisTask(@Param('taskId') taskId: string) {
    return this.ai.getTask(taskId);
  }

  @Post('ai/campaigns/:campaignId/smoke-jobs')
  @UseGuards(AuthGuard, AdminGuard)
  createSmokeAnalysisJob(
    @Param('campaignId') campaignId: string,
    @Body() body: CreateSmokeAnalysisJobBody,
    @Req() req: AuthRequest,
  ) {
    return this.ai.createSmokeJob(campaignId, body, req.user.id);
  }

  @Post('ai/jobs/:jobId/authorize')
  @RequireCapability('AI_EXECUTE')
  @UseGuards(AuthGuard, CapabilityGuard)
  authorizeAnalysisJob(
    @Param('jobId') jobId: string,
    @Req() req: AuthRequest,
  ) {
    return this.ai.authorizeJob(jobId, req.user.id);
  }

  @Post('ai/tasks/:taskId/authorize')
  @RequireCapability('AI_EXECUTE')
  @UseGuards(AuthGuard, CapabilityGuard)
  authorizeAnalysisTask(
    @Param('taskId') taskId: string,
    @Req() req: AuthRequest,
  ) {
    return this.ai.authorizeTask(taskId, req.user.id);
  }

  @Post('ai/jobs/:jobId/pause')
  @RequireCapability('AI_EXECUTE')
  @UseGuards(AuthGuard, CapabilityGuard)
  pauseAnalysisJob(@Param('jobId') jobId: string) {
    return this.ai.pauseJob(jobId);
  }

  @Post('ai/jobs/:jobId/resume')
  @RequireCapability('AI_EXECUTE')
  @UseGuards(AuthGuard, CapabilityGuard)
  resumeAnalysisJob(@Param('jobId') jobId: string) {
    return this.ai.resumeJob(jobId);
  }

  @Post('ai/jobs/:jobId/cancel')
  @RequireCapability('AI_EXECUTE')
  @UseGuards(AuthGuard, CapabilityGuard)
  cancelAnalysisJob(
    @Param('jobId') jobId: string,
    @Body() body: CancelAnalysisJobBody,
  ) {
    return this.ai.cancelJob(jobId, body?.reason);
  }

  @Post('ai/tasks/:taskId/retry')
  @RequireCapability('AI_EXECUTE')
  @UseGuards(AuthGuard, CapabilityGuard)
  retryAnalysisTask(
    @Param('taskId') taskId: string,
    @Req() req: AuthRequest,
  ) {
    return this.ai.retryTask(taskId, req.user.id);
  }
}
