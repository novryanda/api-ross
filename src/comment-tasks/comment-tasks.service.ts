import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  CampaignStatus,
  CommentCommandStatus,
  CommentTaskStatus,
  Prisma,
  UserRole,
} from '../generated/prisma/client.js';
import { buildPaginationMeta } from '../common/dto/pagination-query.dto.js';
import { toAuditJson } from '../common/utils/audit-json.js';
import type { RequestAuditContext } from '../common/utils/request-audit-context.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { RossUserSession } from '../auth/auth.types.js';
import {
  BlockCommentTaskDto,
  BuzzerCommentQueueQueryDto,
  CommentTaskQueryDto,
  CompleteCommentTaskDto,
  KeepCommentTaskDto,
  RejectCommentTaskDto,
} from './dto/index.js';

type CurrentUser = RossUserSession['user'];

const COMMENT_TASK_SORT_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'taskNo',
  'keptAt',
  'keepExpiresAt',
  'completedAt',
  'status',
]);

const OWNED_TASK_STATUSES = [
  CommentTaskStatus.KEPT,
  CommentTaskStatus.IN_PROGRESS,
  CommentTaskStatus.COMPLETED,
  CommentTaskStatus.EXPIRED,
] as CommentTaskStatus[];

const ACTIVE_OWNED_TASK_STATUSES = [
  CommentTaskStatus.KEPT,
  CommentTaskStatus.IN_PROGRESS,
] as CommentTaskStatus[];

const COMMENT_TASK_INCLUDE = {
  command: {
    include: {
      campaign: {
        select: {
          id: true,
          name: true,
          status: true,
          startDate: true,
          endDate: true,
          deletedAt: true,
        },
      },
      socialAccount: {
        select: {
          id: true,
          platform: true,
          username: true,
          displayName: true,
          profileUrl: true,
          category: true,
          status: true,
        },
      },
    },
  },
  keptBy: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  },
} satisfies Prisma.CommentTaskInclude;

type CommentTaskWithRelations = Prisma.CommentTaskGetPayload<{
  include: typeof COMMENT_TASK_INCLUDE;
}>;

function taskOrderBy(
  query: CommentTaskQueryDto | BuzzerCommentQueueQueryDto,
): Prisma.CommentTaskOrderByWithRelationInput {
  const sortBy = COMMENT_TASK_SORT_FIELDS.has(query.sortBy)
    ? query.sortBy
    : 'createdAt';

  return { [sortBy]: query.sortOrder };
}

function toDateRangeFilter(
  query: CommentTaskQueryDto,
): Prisma.DateTimeFilter | undefined {
  if (!query.dateFrom && !query.dateTo) {
    return undefined;
  }

  return {
    ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
    ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
  };
}

@Injectable()
export class CommentTasksService {
  constructor(private readonly prisma: PrismaService) {}

  async findForCampaign(campaignId: string, query: CommentTaskQueryDto) {
    await this.ensureCampaignExists(campaignId);
    await this.expireStaleTasks({ campaignId });

    const createdAt = toDateRangeFilter(query);
    const where: Prisma.CommentTaskWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.keptBy ? { keptById: query.keptBy } : {}),
      ...(query.commandId ? { commentCommandId: query.commandId } : {}),
      ...(createdAt ? { createdAt } : {}),
      command: {
        campaignId,
        deletedAt: null,
        campaign: {
          deletedAt: null,
        },
        ...(query.stance ? { stance: query.stance } : {}),
        ...(query.platform ? { platform: query.platform } : {}),
      },
    };

    return this.findMany(where, query);
  }

  async getCommentQueue(user: CurrentUser, query: BuzzerCommentQueueQueryDto) {
    await this.expireStaleTasks({ userId: user.id });

    const where: Prisma.CommentTaskWhereInput = {
      status: CommentTaskStatus.AVAILABLE,
      command: {
        deletedAt: null,
        status: CommentCommandStatus.ACTIVE,
        ...(query.stance ? { stance: query.stance } : {}),
        ...(query.platform ? { platform: query.platform } : {}),
        campaign: {
          deletedAt: null,
          status: CampaignStatus.ACTIVE,
          members: {
            some: {
              userId: user.id,
            },
          },
        },
      },
    };

    return this.findMany(where, query);
  }

  async findForBuzzer(user: CurrentUser, query: CommentTaskQueryDto) {
    await this.expireStaleTasks({ userId: user.id });

    const createdAt = toDateRangeFilter(query);
    const where: Prisma.CommentTaskWhereInput = {
      keptById: user.id,
      status: query.status
        ? query.status
        : {
            in: OWNED_TASK_STATUSES,
          },
      ...(query.commandId ? { commentCommandId: query.commandId } : {}),
      ...(createdAt ? { createdAt } : {}),
      command: {
        deletedAt: null,
        campaign: {
          deletedAt: null,
        },
        ...(query.stance ? { stance: query.stance } : {}),
        ...(query.platform ? { platform: query.platform } : {}),
      },
    };

    return this.findMany(where, query);
  }

  async findOneForBuzzer(user: CurrentUser, taskId: string) {
    await this.expireStaleTasks({ taskId });
    const task = await this.findTaskById(taskId);
    this.ensureTaskOwner(task, user);
    return this.toTaskResponse(task);
  }

  async keep(
    user: CurrentUser,
    taskId: string,
    dto?: KeepCommentTaskDto,
    auditContext?: RequestAuditContext,
  ) {
    await this.expireStaleTasks({ taskId });
    const task = await this.findTaskById(taskId);
    await this.ensureCampaignAccess(user, task.command.campaignId);

    if (task.command.status !== CommentCommandStatus.ACTIVE) {
      throw new ConflictException({
        code: 'COMMENT_COMMAND_NOT_ACTIVE',
        message: 'Comment task command is not active.',
        details: [],
      });
    }

    if (task.status !== CommentTaskStatus.AVAILABLE) {
      throw await this.buildTaskUnavailableError(taskId);
    }

    const now = new Date();
    const keepDurationMinutes =
      dto?.keepDurationMinutes ?? task.command.keepExpiryMinutes;
    const keepExpiresAt = new Date(
      now.getTime() + keepDurationMinutes * 60 * 1000,
    );

    const kept = await this.prisma.$transaction(async (tx) => {
      const updateResult = await tx.commentTask.updateMany({
        where: {
          id: taskId,
          status: CommentTaskStatus.AVAILABLE,
          command: {
            deletedAt: null,
            status: CommentCommandStatus.ACTIVE,
            campaign: {
              deletedAt: null,
              members: {
                some: {
                  userId: user.id,
                },
              },
            },
          },
        },
        data: {
          status: CommentTaskStatus.KEPT,
          keptById: user.id,
          keptAt: now,
          keepExpiresAt,
        },
      });

      if (updateResult.count === 0) {
        throw await this.buildTaskUnavailableError(taskId);
      }

      const nextTask = await tx.commentTask.findUniqueOrThrow({
        where: { id: taskId },
        include: COMMENT_TASK_INCLUDE,
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          campaignId: nextTask.command.campaignId,
          action: AuditAction.COMMENT_TASK_KEPT,
          entityType: 'CommentTask',
          entityId: nextTask.id,
          oldValue: toAuditJson(task),
          newValue: toAuditJson(nextTask),
          ipAddress: auditContext?.ipAddress,
          userAgent: auditContext?.userAgent,
        },
      });

      return nextTask;
    });

    return this.toTaskResponse(kept);
  }

  async release(
    user: CurrentUser,
    taskId: string,
    auditContext?: RequestAuditContext,
  ) {
    await this.expireStaleTasks({ taskId });
    const task = await this.findTaskById(taskId);

    if (user.role === UserRole.BUZZER) {
      await this.ensureCampaignAccess(user, task.command.campaignId);
      this.ensureTaskOwner(task, user);
    }

    if (!ACTIVE_OWNED_TASK_STATUSES.includes(task.status)) {
      throw new ConflictException({
        code: 'COMMENT_TASK_INVALID_STATUS',
        message: 'Only kept or in-progress comment tasks can be released.',
        details: [],
      });
    }

    const released = await this.prisma.$transaction(async (tx) => {
      const nextTask = await tx.commentTask.update({
        where: { id: taskId },
        data: {
          status: CommentTaskStatus.AVAILABLE,
          keptById: null,
          keptAt: null,
          keepExpiresAt: null,
        },
        include: COMMENT_TASK_INCLUDE,
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          campaignId: task.command.campaignId,
          action: AuditAction.COMMENT_TASK_RELEASED,
          entityType: 'CommentTask',
          entityId: task.id,
          oldValue: toAuditJson(task),
          newValue: toAuditJson(nextTask),
          ipAddress: auditContext?.ipAddress,
          userAgent: auditContext?.userAgent,
        },
      });

      return nextTask;
    });

    return this.toTaskResponse(released);
  }

  async start(
    user: CurrentUser,
    taskId: string,
    auditContext?: RequestAuditContext,
  ) {
    await this.expireStaleTasks({ taskId });
    const task = await this.findTaskById(taskId);
    this.ensureTaskOwner(task, user);

    if (task.status !== CommentTaskStatus.KEPT) {
      throw new ConflictException({
        code: 'COMMENT_TASK_INVALID_STATUS',
        message: 'Only kept comment tasks can be started.',
        details: [],
      });
    }

    this.ensureKeepNotExpired(task);

    const started = await this.prisma.$transaction(async (tx) => {
      const updateResult = await tx.commentTask.updateMany({
        where: {
          id: taskId,
          keptById: user.id,
          status: CommentTaskStatus.KEPT,
        },
        data: {
          status: CommentTaskStatus.IN_PROGRESS,
        },
      });

      if (updateResult.count === 0) {
        throw new ConflictException({
          code: 'COMMENT_TASK_INVALID_STATUS',
          message: 'Comment task can no longer be started.',
          details: [],
        });
      }

      const nextTask = await tx.commentTask.findUniqueOrThrow({
        where: { id: taskId },
        include: COMMENT_TASK_INCLUDE,
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          campaignId: nextTask.command.campaignId,
          action: AuditAction.COMMENT_TASK_STARTED,
          entityType: 'CommentTask',
          entityId: nextTask.id,
          oldValue: toAuditJson(task),
          newValue: toAuditJson(nextTask),
          ipAddress: auditContext?.ipAddress,
          userAgent: auditContext?.userAgent,
        },
      });

      return nextTask;
    });

    return this.toTaskResponse(started);
  }

  async complete(
    user: CurrentUser,
    taskId: string,
    dto: CompleteCommentTaskDto,
    auditContext?: RequestAuditContext,
  ) {
    await this.expireStaleTasks({ taskId });
    const task = await this.findTaskById(taskId);
    this.ensureTaskOwner(task, user);

    if (!ACTIVE_OWNED_TASK_STATUSES.includes(task.status)) {
      throw new ConflictException({
        code: 'COMMENT_TASK_INVALID_STATUS',
        message: 'Only kept or in-progress comment tasks can be completed.',
        details: [],
      });
    }

    this.ensureKeepNotExpired(task);

    const completedAt = new Date();
    const completed = await this.prisma.$transaction(async (tx) => {
      const updateResult = await tx.commentTask.updateMany({
        where: {
          id: taskId,
          keptById: user.id,
          status: {
            in: [CommentTaskStatus.KEPT, CommentTaskStatus.IN_PROGRESS],
          },
        },
        data: {
          status: CommentTaskStatus.COMPLETED,
          proofLink: dto.proofLink,
          notes: dto.notes,
          completedAt,
        },
      });

      if (updateResult.count === 0) {
        throw new ConflictException({
          code: 'COMMENT_TASK_INVALID_STATUS',
          message: 'Comment task can no longer be completed.',
          details: [],
        });
      }

      const nextTask = await tx.commentTask.findUniqueOrThrow({
        where: { id: taskId },
        include: COMMENT_TASK_INCLUDE,
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          campaignId: nextTask.command.campaignId,
          action: AuditAction.COMMENT_TASK_COMPLETED,
          entityType: 'CommentTask',
          entityId: nextTask.id,
          oldValue: toAuditJson(task),
          newValue: toAuditJson(nextTask),
          ipAddress: auditContext?.ipAddress,
          userAgent: auditContext?.userAgent,
        },
      });

      return nextTask;
    });

    return this.toTaskResponse(completed);
  }

  async reject(
    user: CurrentUser,
    taskId: string,
    dto: RejectCommentTaskDto,
    auditContext?: RequestAuditContext,
  ) {
    return this.cancelWithReason(
      user,
      taskId,
      `Rejected: ${dto.reason}`,
      AuditAction.COMMENT_TASK_REJECTED,
      auditContext,
    );
  }

  async block(
    user: CurrentUser,
    taskId: string,
    dto: BlockCommentTaskDto,
    auditContext?: RequestAuditContext,
  ) {
    return this.cancelWithReason(
      user,
      taskId,
      `Blocked: ${dto.reason}`,
      AuditAction.COMMENT_TASK_BLOCKED,
      auditContext,
    );
  }

  private async cancelWithReason(
    user: CurrentUser,
    taskId: string,
    notes: string,
    action:
      | typeof AuditAction.COMMENT_TASK_REJECTED
      | typeof AuditAction.COMMENT_TASK_BLOCKED,
    auditContext?: RequestAuditContext,
  ) {
    await this.expireStaleTasks({ taskId });
    const task = await this.findTaskById(taskId);
    this.ensureTaskOwner(task, user);

    if (!ACTIVE_OWNED_TASK_STATUSES.includes(task.status)) {
      throw new ConflictException({
        code: 'COMMENT_TASK_INVALID_STATUS',
        message: 'Only kept or in-progress comment tasks can be cancelled.',
        details: [],
      });
    }

    const cancelled = await this.prisma.$transaction(async (tx) => {
      const nextTask = await tx.commentTask.update({
        where: { id: taskId },
        data: {
          status: CommentTaskStatus.CANCELLED,
          notes,
          completedAt: new Date(),
        },
        include: COMMENT_TASK_INCLUDE,
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          campaignId: task.command.campaignId,
          action,
          entityType: 'CommentTask',
          entityId: task.id,
          oldValue: toAuditJson(task),
          newValue: toAuditJson(nextTask),
          ipAddress: auditContext?.ipAddress,
          userAgent: auditContext?.userAgent,
        },
      });

      return nextTask;
    });

    return this.toTaskResponse(cancelled);
  }

  private async findMany(
    where: Prisma.CommentTaskWhereInput,
    query: CommentTaskQueryDto | BuzzerCommentQueueQueryDto,
  ) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.commentTask.findMany({
        where,
        orderBy: taskOrderBy(query),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: COMMENT_TASK_INCLUDE,
      }),
      this.prisma.commentTask.count({ where }),
    ]);

    return {
      items: items.map((item) => this.toTaskResponse(item)),
      meta: buildPaginationMeta(query.page, query.limit, total),
    };
  }

  private async findTaskById(taskId: string) {
    const task = await this.prisma.commentTask.findUnique({
      where: { id: taskId },
      include: COMMENT_TASK_INCLUDE,
    });

    if (!task || task.command.deletedAt || task.command.campaign.deletedAt) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Comment task not found.',
        details: [],
      });
    }

    return task;
  }

  private ensureTaskOwner(task: CommentTaskWithRelations, user: CurrentUser) {
    if (task.keptById !== user.id) {
      throw new ForbiddenException({
        code: 'COMMENT_TASK_ACCESS_DENIED',
        message: 'Buzzer can only access their own kept comment tasks.',
        details: [],
      });
    }
  }

  private ensureKeepNotExpired(task: CommentTaskWithRelations) {
    if (task.keepExpiresAt && task.keepExpiresAt < new Date()) {
      throw new ConflictException({
        code: 'COMMENT_TASK_KEEP_EXPIRED',
        message: 'Comment task keep window has expired.',
        details: [],
      });
    }
  }

  private async ensureCampaignAccess(user: CurrentUser, campaignId: string) {
    const membership = await this.prisma.campaignMember.findUnique({
      where: {
        campaignId_userId: {
          campaignId,
          userId: user.id,
        },
      },
      select: {
        id: true,
        campaign: {
          select: { deletedAt: true },
        },
      },
    });

    if (!membership || membership.campaign.deletedAt) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Campaign access denied.',
        details: [],
      });
    }
  }

  private async ensureCampaignExists(campaignId: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: {
        id: campaignId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!campaign) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Campaign not found.',
        details: [],
      });
    }
  }

  private async buildTaskUnavailableError(taskId: string) {
    const latest = await this.prisma.commentTask.findUnique({
      where: { id: taskId },
      select: {
        status: true,
        keptById: true,
        command: {
          select: {
            status: true,
            deletedAt: true,
            campaign: {
              select: {
                deletedAt: true,
              },
            },
          },
        },
      },
    });

    if (
      !latest ||
      latest.command.deletedAt ||
      latest.command.status !== CommentCommandStatus.ACTIVE ||
      latest.command.campaign.deletedAt
    ) {
      return new ConflictException({
        code: 'COMMENT_TASK_NOT_AVAILABLE',
        message: 'Comment task is not available.',
        details: [],
      });
    }

    if (ACTIVE_OWNED_TASK_STATUSES.includes(latest.status) && latest.keptById) {
      return new ConflictException({
        code: 'COMMENT_TASK_ALREADY_KEPT',
        message: 'Comment task is already kept by another buzzer.',
        details: [],
      });
    }

    return new ConflictException({
      code: 'COMMENT_TASK_NOT_AVAILABLE',
      message: 'Comment task is not available.',
      details: [],
    });
  }

  private async expireStaleTasks(filter: {
    campaignId?: string;
    commandId?: string;
    taskId?: string;
    userId?: string;
  }) {
    const now = new Date();
    const tasks = await this.prisma.commentTask.findMany({
      where: {
        ...(filter.taskId ? { id: filter.taskId } : {}),
        ...(filter.userId ? { keptById: filter.userId } : {}),
        status: { in: [CommentTaskStatus.KEPT, CommentTaskStatus.IN_PROGRESS] },
        keepExpiresAt: { lt: now },
        command: {
          ...(filter.campaignId ? { campaignId: filter.campaignId } : {}),
          ...(filter.commandId ? { id: filter.commandId } : {}),
          deletedAt: null,
          campaign: { deletedAt: null },
        },
      },
      include: {
        command: { select: { campaignId: true } },
      },
    });

    if (tasks.length === 0) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      for (const task of tasks) {
        const nextTask = await tx.commentTask.update({
          where: { id: task.id },
          data: { status: CommentTaskStatus.EXPIRED },
        });

        await tx.auditLog.create({
          data: {
            campaignId: task.command.campaignId,
            action: AuditAction.COMMENT_TASK_EXPIRED,
            entityType: 'CommentTask',
            entityId: task.id,
            oldValue: toAuditJson(task),
            newValue: toAuditJson(nextTask),
          },
        });
      }
    });
  }

  private toTaskResponse(task: CommentTaskWithRelations) {
    return {
      id: task.id,
      commentCommandId: task.commentCommandId,
      commandId: task.commentCommandId,
      campaignId: task.command.campaignId,
      taskNo: task.taskNo,
      status: task.status,
      keptById: task.keptById,
      keptBy: task.keptBy,
      keptAt: task.keptAt,
      keepExpiresAt: task.keepExpiresAt,
      completedAt: task.completedAt,
      proofLink: task.proofLink,
      notes: task.notes,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      command: {
        id: task.command.id,
        campaignId: task.command.campaignId,
        campaign: {
          id: task.command.campaign.id,
          name: task.command.campaign.name,
          status: task.command.campaign.status,
          startDate: task.command.campaign.startDate,
          endDate: task.command.campaign.endDate,
        },
        targetPostUrl: task.command.targetPostUrl,
        platform: task.command.platform,
        socialAccountId: task.command.socialAccountId,
        socialAccount: task.command.socialAccount,
        stance: task.command.stance,
        narrative: task.command.narrative,
        instruction: task.command.instruction,
        requiredSlots: task.command.requiredSlots,
        keepExpiryMinutes: task.command.keepExpiryMinutes,
        deadline: task.command.deadline,
        status: task.command.status,
      },
    };
  }
}
