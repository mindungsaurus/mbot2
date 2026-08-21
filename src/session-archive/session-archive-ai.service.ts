import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  AnalysisJobStatus,
  AnalysisPriority,
  AnalysisTaskStatus,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import type {
  AnalysisJobListQuery,
  CreateSmokeAnalysisJobBody,
} from './session-archive.dto';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const DEFAULT_CONCURRENCY = 2;
const WORKER_POLL_MS = 2_000;
const TASK_LEASE_MS = 60_000;
const DEFAULT_MAX_ATTEMPTS = 3;

type PageInput = {
  page?: string;
  pageSize?: string;
};

type ClaimedTask = Prisma.AnalysisTaskGetPayload<{ include: { job: true } }>;

@Injectable()
export class SessionArchiveAiService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SessionArchiveAiService.name);
  private readonly workerId = `${process.pid}-${Math.random()
    .toString(36)
    .slice(2)}`;
  private readonly concurrency = this.parsePositiveInt(
    process.env.SESSION_ARCHIVE_AI_WORKER_CONCURRENCY,
    DEFAULT_CONCURRENCY,
  );
  private timer: NodeJS.Timeout | null = null;
  private polling = false;

  constructor(private readonly prisma: PrismaClient) {}

  onModuleInit() {
    if (!this.isWorkerEnabled()) return;
    this.timer = setInterval(() => {
      void this.processQueueOnce();
    }, WORKER_POLL_MS);
    void this.processQueueOnce();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async listJobs(query: AnalysisJobListQuery) {
    const { page, pageSize, skip } = this.parsePage(query);
    const where: Prisma.AnalysisJobWhereInput = {};
    const campaignId = this.optionalString(query.campaignId);
    if (campaignId) where.campaignId = campaignId;
    const status = this.optionalJobStatus(query.status);
    if (status) where.status = status;

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.analysisJob.count({ where }),
      this.prisma.analysisJob.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip,
        take: pageSize,
        include: {
          createdByUser: { select: { id: true, username: true } },
          _count: { select: { tasks: true } },
        },
      }),
    ]);
    return { rows, total, page, pageSize };
  }

  async getJob(jobId: string) {
    const job = await this.prisma.analysisJob.findUnique({
      where: { id: this.requireString(jobId, 'jobId') },
      include: {
        createdByUser: { select: { id: true, username: true } },
        tasks: {
          orderBy: [{ createdAt: 'asc' }],
          include: {
            authorizedByUser: { select: { id: true, username: true } },
            runs: {
              orderBy: [{ attemptNumber: 'asc' }],
              include: {
                authorizedByUser: { select: { id: true, username: true } },
              },
            },
          },
        },
      },
    });
    if (!job) throw new NotFoundException('analysis job not found');
    return job;
  }

  async getTask(taskId: string) {
    const task = await this.prisma.analysisTask.findUnique({
      where: { id: this.requireString(taskId, 'taskId') },
      include: {
        job: true,
        authorizedByUser: { select: { id: true, username: true } },
        runs: {
          orderBy: [{ attemptNumber: 'asc' }],
          include: {
            authorizedByUser: { select: { id: true, username: true } },
          },
        },
      },
    });
    if (!task) throw new NotFoundException('analysis task not found');
    return task;
  }

  async createSmokeJob(
    campaignId: string,
    body: CreateSmokeAnalysisJobBody,
    userId: string,
  ) {
    this.ensureSmokeJobsEnabled();
    await this.requireCampaign(campaignId);
    const priority = this.optionalPriority(body.priority) ?? 'NORMAL';
    const maxAttempts =
      this.optionalPositiveInt(body.maxAttempts, 'maxAttempts') ??
      DEFAULT_MAX_ATTEMPTS;
    const idempotencyKey = this.optionalString(body.idempotencyKey);
    const payload = {
      kind: 'SMOKE_TEST',
      message: this.optionalString(body.message) ?? 'Return exactly OK.',
      shouldFail: this.optionalBoolean(body.shouldFail) ?? false,
    };

    try {
      return await this.prisma.analysisJob.create({
        data: {
          campaignId,
          type: 'SMOKE_TEST',
          status: 'WAITING_AUTHORIZATION',
          priority,
          createdByUserId: userId,
          tasks: {
            create: {
              campaignId,
              type: 'SMOKE_TEST',
              status: 'WAITING_AUTHORIZATION',
              priority,
              idempotencyKey,
              payloadJson: payload,
              maxAttempts,
            },
          },
        },
        include: { tasks: true },
      });
    } catch (e) {
      this.mapPrismaError(e);
    }
  }

  async authorizeJob(jobId: string, userId: string) {
    const job = await this.requireJob(jobId);
    if (job.status === 'CANCELED') {
      throw new BadRequestException('canceled job cannot be authorized');
    }
    const now = new Date();
    await this.prisma.analysisTask.updateMany({
      where: { jobId: job.id, status: 'WAITING_AUTHORIZATION' },
      data: this.authorizedQueueData(userId, now),
    });
    await this.recalculateJobStatus(job.id);
    return this.getJob(job.id);
  }

  async authorizeTask(taskId: string, userId: string) {
    const task = await this.requireTask(taskId);
    if (task.status !== 'WAITING_AUTHORIZATION') {
      throw new BadRequestException('task is not waiting authorization');
    }
    await this.prisma.analysisTask.update({
      where: { id: task.id },
      data: this.authorizedQueueData(userId),
    });
    await this.recalculateJobStatus(task.jobId);
    return this.getTask(task.id);
  }

  async pauseJob(jobId: string) {
    const job = await this.requireJob(jobId);
    if (
      [
        'WAITING_AUTHORIZATION',
        'SUCCEEDED',
        'FAILED',
        'COMPLETED_WITH_ERRORS',
        'CANCELED',
      ].includes(job.status)
    ) {
      throw new BadRequestException('job cannot be paused in its current status');
    }
    await this.prisma.$transaction([
      this.prisma.analysisJob.update({
        where: { id: job.id },
        data: { status: 'PAUSED', pausedAt: new Date() },
      }),
      this.prisma.analysisTask.updateMany({
        where: { jobId: job.id, status: 'QUEUED' },
        data: { status: 'PAUSED' },
      }),
    ]);
    return this.getJob(job.id);
  }

  async resumeJob(jobId: string) {
    const job = await this.requireJob(jobId);
    if (job.status !== 'PAUSED') {
      throw new BadRequestException('job is not paused');
    }
    await this.prisma.$transaction([
      this.prisma.analysisTask.updateMany({
        where: {
          jobId: job.id,
          status: 'PAUSED',
          ...this.authorizedTaskWhere(),
        },
        data: { status: 'QUEUED' },
      }),
      this.prisma.analysisJob.update({
        where: { id: job.id },
        data: { status: 'QUEUED', pausedAt: null },
      }),
    ]);
    await this.recalculateJobStatus(job.id);
    return this.getJob(job.id);
  }

  async cancelJob(jobId: string, reason?: unknown) {
    const job = await this.requireJob(jobId);
    if (['SUCCEEDED', 'FAILED', 'COMPLETED_WITH_ERRORS', 'CANCELED'].includes(job.status)) {
      throw new BadRequestException('finished job cannot be canceled');
    }
    await this.prisma.$transaction([
      this.prisma.analysisJob.update({
        where: { id: job.id },
        data: {
          status: 'CANCELED',
          canceledAt: new Date(),
          cancelReason: this.optionalString(reason),
          finishedAt: new Date(),
        },
      }),
      this.prisma.analysisTask.updateMany({
        where: {
          jobId: job.id,
          status: { in: ['WAITING_AUTHORIZATION', 'QUEUED', 'PAUSED'] },
        },
        data: { status: 'CANCELED', finishedAt: new Date() },
      }),
    ]);
    return this.getJob(job.id);
  }

  async retryTask(taskId: string, userId: string) {
    const task = await this.requireTask(taskId);
    if (task.status !== 'FAILED') {
      throw new BadRequestException('only failed tasks can be retried');
    }
    await this.prisma.analysisTask.update({
      where: { id: task.id },
      data: {
        ...this.authorizedQueueData(userId),
        lastError: null,
        finishedAt: null,
        runAfterAt: new Date(),
      },
    });
    await this.recalculateJobStatus(task.jobId);
    return this.getTask(task.id);
  }

  async processQueueOnce() {
    if (this.polling) return;
    this.polling = true;
    try {
      await this.recoverStaleRunningTasks();
      const claimed: ClaimedTask[] = [];
      for (let i = 0; i < this.concurrency; i += 1) {
        const task = await this.claimNextTask();
        if (!task) break;
        claimed.push(task);
      }
      await Promise.all(claimed.map((task) => this.executeClaimedTask(task)));
    } finally {
      this.polling = false;
    }
  }

  private async claimNextTask() {
    const now = new Date();
    const lockExpiresAt = new Date(now.getTime() + TASK_LEASE_MS);
    const candidates = await this.prisma.analysisTask.findMany({
      where: {
        status: 'QUEUED',
        ...this.authorizedTaskWhere(),
        OR: [{ runAfterAt: null }, { runAfterAt: { lte: now } }],
        job: { status: { notIn: ['PAUSED', 'CANCELED'] } },
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      take: this.concurrency * 2,
      select: { id: true },
    });

    for (const candidate of candidates) {
      const claimed = await this.prisma.analysisTask.updateMany({
        where: {
          id: candidate.id,
          status: 'QUEUED',
          ...this.authorizedTaskWhere(),
          OR: [{ runAfterAt: null }, { runAfterAt: { lte: now } }],
          job: { status: { notIn: ['PAUSED', 'CANCELED'] } },
        },
        data: {
          status: 'RUNNING',
          attemptCount: { increment: 1 },
          lockedAt: now,
          lockExpiresAt,
          heartbeatAt: now,
          workerId: this.workerId,
          startedAt: now,
        },
      });
      if (claimed.count === 1) {
        return this.findTaskForExecution(candidate.id);
      }
    }
    return null;
  }

  private findTaskForExecution(taskId: string) {
    return this.prisma.analysisTask.findUnique({
      where: { id: taskId },
      include: { job: true },
    });
  }

  private async executeClaimedTask(task: ClaimedTask) {
    if (!task) return;
    if (!task.authorizedByUserId || !task.authorizedAt) {
      await this.failUnauthorizedRunningTask(task.id, task.jobId);
      return;
    }
    await this.markJobRunning(task.jobId);
    const run = await this.prisma.analysisRun.create({
      data: {
        taskId: task.id,
        authorizedByUserId: task.authorizedByUserId,
        authorizedAt: task.authorizedAt,
        attemptNumber: task.attemptCount,
        provider: 'MOCK',
        model: 'mock-smoke-v1',
        promptVersion: 'smoke-v1',
        pipelineVersion: 'session-archive-ai-v1',
        status: 'RUNNING',
        requestMetadataJson: {
          workerId: this.workerId,
          leaseMs: TASK_LEASE_MS,
        },
      },
    });

    try {
      await this.prisma.analysisTask.update({
        where: { id: task.id },
        data: { heartbeatAt: new Date() },
      });
      const result = await this.executeMockTask(task);
      await this.prisma.$transaction([
        this.prisma.analysisRun.update({
          where: { id: run.id },
          data: {
            status: 'SUCCEEDED',
            finishedAt: new Date(),
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            estimatedCost: new Prisma.Decimal(0),
            rawResponseJson: result,
          },
        }),
        this.prisma.analysisTask.update({
          where: { id: task.id },
          data: {
            status: 'SUCCEEDED',
            resultJson: result,
            lastError: null,
            lockedAt: null,
            lockExpiresAt: null,
            heartbeatAt: null,
            workerId: null,
            finishedAt: new Date(),
          },
        }),
      ]);
    } catch (error) {
      const message = this.safeErrorMessage(error);
      const retry = task.attemptCount < task.maxAttempts;
      await this.prisma.$transaction([
        this.prisma.analysisRun.update({
          where: { id: run.id },
          data: {
            status: 'FAILED',
            finishedAt: new Date(),
            errorMessage: message,
            rawResponseJson: { error: message },
          },
        }),
        this.prisma.analysisTask.update({
          where: { id: task.id },
          data: {
            status: retry ? 'QUEUED' : 'FAILED',
            lastError: message,
            lockedAt: null,
            lockExpiresAt: null,
            heartbeatAt: null,
            workerId: null,
            runAfterAt: retry ? this.nextRetryAt(task.attemptCount) : null,
            finishedAt: retry ? null : new Date(),
          },
        }),
      ]);
      this.logger.warn(`analysis task ${task.id} failed: ${message}`);
    } finally {
      await this.recalculateJobStatus(task.jobId);
    }
  }

  private async executeMockTask(task: ClaimedTask) {
    if (task.type !== 'SMOKE_TEST') {
      throw new Error(`executor not implemented for ${task.type}`);
    }
    const payload = this.asRecord(task.payloadJson);
    if (payload.shouldFail === true) {
      throw new Error('mock smoke failure requested');
    }
    return {
      ok: true,
      output: 'OK',
      taskId: task.id,
      promptVersion: 'smoke-v1',
      pipelineVersion: 'session-archive-ai-v1',
    };
  }

  private async recoverStaleRunningTasks() {
    const now = new Date();
    await this.prisma.analysisTask.updateMany({
      where: {
        status: 'RUNNING',
        lockExpiresAt: { lt: now },
        OR: [{ authorizedByUserId: null }, { authorizedAt: null }],
      },
      data: {
        status: 'FAILED',
        lastError: 'worker lease expired without authorization; task failed',
        lockedAt: null,
        lockExpiresAt: null,
        heartbeatAt: null,
        workerId: null,
        finishedAt: now,
      },
    });
    await this.prisma.analysisTask.updateMany({
      where: {
        status: 'RUNNING',
        lockExpiresAt: { lt: now },
        ...this.authorizedTaskWhere(),
      },
      data: {
        status: 'QUEUED',
        lastError: 'worker lease expired; task requeued',
        lockedAt: null,
        lockExpiresAt: null,
        heartbeatAt: null,
        workerId: null,
        runAfterAt: now,
      },
    });
  }

  private async markJobRunning(jobId: string) {
    await this.prisma.analysisJob.updateMany({
      where: { id: jobId, status: 'QUEUED' },
      data: { status: 'RUNNING', startedAt: new Date() },
    });
  }

  private async recalculateJobStatus(jobId: string) {
    const job = await this.prisma.analysisJob.findUnique({
      where: { id: jobId },
      select: { id: true, status: true, startedAt: true },
    });
    if (!job || ['PAUSED', 'CANCELED'].includes(job.status)) return;

    const tasks = await this.prisma.analysisTask.groupBy({
      by: ['status'],
      where: { jobId },
      _count: { _all: true },
    });
    const counts = new Map<AnalysisTaskStatus, number>(
      tasks.map((row) => [row.status, row._count._all]),
    );
    const total = tasks.reduce((sum, row) => sum + row._count._all, 0);
    if (total === 0) return;

    let status: AnalysisJobStatus = 'WAITING_AUTHORIZATION';
    const running = counts.get('RUNNING') ?? 0;
    const queued = counts.get('QUEUED') ?? 0;
    const paused = counts.get('PAUSED') ?? 0;
    const waiting = counts.get('WAITING_AUTHORIZATION') ?? 0;
    const succeeded = counts.get('SUCCEEDED') ?? 0;
    const failed = counts.get('FAILED') ?? 0;
    const canceled = counts.get('CANCELED') ?? 0;

    if (running > 0) status = 'RUNNING';
    else if (queued > 0) status = 'QUEUED';
    else if (paused > 0) status = 'PAUSED';
    else if (waiting > 0) status = 'WAITING_AUTHORIZATION';
    else if (succeeded === total) status = 'SUCCEEDED';
    else if (failed > 0 && succeeded > 0) status = 'COMPLETED_WITH_ERRORS';
    else if (failed > 0) status = 'FAILED';
    else if (canceled === total) status = 'CANCELED';

    await this.prisma.analysisJob.update({
      where: { id: jobId },
      data: {
        status,
        startedAt:
          job.startedAt ??
          (['RUNNING', 'SUCCEEDED'].includes(status) ? new Date() : null),
        finishedAt: [
          'SUCCEEDED',
          'FAILED',
          'COMPLETED_WITH_ERRORS',
          'CANCELED',
        ].includes(status)
          ? new Date()
          : null,
      },
    });
  }

  private nextRetryAt(attemptCount: number) {
    const seconds = Math.min(60, 2 ** Math.max(0, attemptCount - 1));
    return new Date(Date.now() + seconds * 1000);
  }

  private authorizedQueueData(
    userId: string,
    authorizedAt = new Date(),
  ): Prisma.AnalysisTaskUncheckedUpdateManyInput {
    return {
      status: 'QUEUED',
      authorizedByUserId: userId,
      authorizedAt,
      lastError: null,
      lockedAt: null,
      lockExpiresAt: null,
      heartbeatAt: null,
      workerId: null,
      runAfterAt: null,
      finishedAt: null,
    };
  }

  private authorizedTaskWhere(): Prisma.AnalysisTaskWhereInput {
    return {
      authorizedByUserId: { not: null },
      authorizedAt: { not: null },
    };
  }

  private async failUnauthorizedRunningTask(taskId: string, jobId: string) {
    await this.prisma.analysisTask.updateMany({
      where: {
        id: taskId,
        OR: [{ authorizedByUserId: null }, { authorizedAt: null }],
      },
      data: {
        status: 'FAILED',
        lastError: 'running task had no authorization snapshot; task failed',
        lockedAt: null,
        lockExpiresAt: null,
        heartbeatAt: null,
        workerId: null,
        finishedAt: new Date(),
      },
    });
    await this.recalculateJobStatus(jobId);
  }

  private ensureSmokeJobsEnabled() {
    const explicit = String(
      process.env.SESSION_ARCHIVE_AI_SMOKE_JOBS_ENABLED ?? '',
    )
      .trim()
      .toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(explicit)) return;

    const nodeEnv = String(process.env.NODE_ENV ?? '')
      .trim()
      .toLowerCase();
    if (nodeEnv !== 'production') return;

    throw new BadRequestException('smoke analysis jobs are disabled');
  }

  private parsePage(query: PageInput) {
    const page = Math.max(0, Math.trunc(Number(query.page ?? 0)));
    const rawPageSize = Math.trunc(Number(query.pageSize ?? DEFAULT_PAGE_SIZE));
    const pageSize =
      Number.isFinite(rawPageSize) && rawPageSize > 0
        ? Math.min(rawPageSize, MAX_PAGE_SIZE)
        : DEFAULT_PAGE_SIZE;
    return { page, pageSize, skip: page * pageSize };
  }

  private parsePositiveInt(raw: unknown, fallback: number) {
    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0) return fallback;
    return value;
  }

  private optionalPositiveInt(raw: unknown, field: string) {
    if (raw === undefined || raw === null || this.trimString(raw) === '') {
      return undefined;
    }
    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0) {
      throw new BadRequestException(`${field} must be a positive integer`);
    }
    return value;
  }

  private trimString(raw: unknown): string {
    return String(raw ?? '').trim();
  }

  private optionalString(raw: unknown): string | null {
    if (raw === undefined || raw === null) return null;
    const value = this.trimString(raw);
    return value ? value : null;
  }

  private requireString(raw: unknown, field: string): string {
    const value = this.trimString(raw);
    if (!value) throw new BadRequestException(`${field} required`);
    return value;
  }

  private optionalBoolean(raw: unknown): boolean | undefined {
    if (raw === undefined) return undefined;
    if (typeof raw === 'boolean') return raw;
    if (typeof raw === 'string') {
      const value = raw.trim().toLowerCase();
      if (['true', '1', 'yes', 'on'].includes(value)) return true;
      if (['false', '0', 'no', 'off'].includes(value)) return false;
    }
    throw new BadRequestException('boolean value required');
  }

  private optionalPriority(raw: unknown): AnalysisPriority | undefined {
    if (raw === undefined) return undefined;
    const value = this.requireString(raw, 'priority') as AnalysisPriority;
    if (!['HIGH', 'NORMAL', 'LOW'].includes(value)) {
      throw new BadRequestException('priority is invalid');
    }
    return value;
  }

  private optionalJobStatus(raw: unknown): AnalysisJobStatus | undefined {
    if (raw === undefined) return undefined;
    const value = this.requireString(raw, 'status') as AnalysisJobStatus;
    if (
      ![
        'WAITING_AUTHORIZATION',
        'QUEUED',
        'RUNNING',
        'PAUSED',
        'SUCCEEDED',
        'COMPLETED_WITH_ERRORS',
        'FAILED',
        'CANCELED',
      ].includes(value)
    ) {
      throw new BadRequestException('status is invalid');
    }
    return value;
  }

  private asRecord(value: Prisma.JsonValue | null | undefined) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
  }

  private isWorkerEnabled() {
    const raw = String(process.env.SESSION_ARCHIVE_AI_WORKER_ENABLED ?? 'true')
      .trim()
      .toLowerCase();
    return !['false', '0', 'off', 'no'].includes(raw);
  }

  private safeErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }

  private mapPrismaError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new ConflictException('unique constraint violation');
      }
      if (error.code === 'P2003') {
        throw new BadRequestException('invalid referenced entity');
      }
      if (error.code === 'P2025') {
        throw new NotFoundException('target not found');
      }
    }
    throw error;
  }

  private async requireCampaign(campaignId: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: this.requireString(campaignId, 'campaignId') },
      select: { id: true },
    });
    if (!campaign) throw new NotFoundException('campaign not found');
    return campaign;
  }

  private async requireUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: this.requireString(userId, 'userId') },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('user not found');
    return user;
  }

  private async requireJob(jobId: string) {
    const job = await this.prisma.analysisJob.findUnique({
      where: { id: this.requireString(jobId, 'jobId') },
    });
    if (!job) throw new NotFoundException('analysis job not found');
    return job;
  }

  private async requireTask(taskId: string) {
    const task = await this.prisma.analysisTask.findUnique({
      where: { id: this.requireString(taskId, 'taskId') },
    });
    if (!task) throw new NotFoundException('analysis task not found');
    return task;
  }
}
