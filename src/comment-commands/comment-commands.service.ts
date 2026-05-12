import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  CommentCommandStatus,
  CommentTaskStatus,
  Prisma,
  SocialAccountStatus,
} from '../generated/prisma/client.js';
import { buildPaginationMeta } from '../common/dto/pagination-query.dto.js';
import { toAuditJson } from '../common/utils/audit-json.js';
import type { RequestAuditContext } from '../common/utils/request-audit-context.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { RossUserSession } from '../auth/auth.types.js';
import {
  AssignCommentCommandDto,
  CommentCommandQueryDto,
  CreateCommentCommandDto,
  UpdateCommentCommandDto,
  UpdateCommentCommandStatusDto,
} from './dto/index.js';

type CurrentUser = RossUserSession['user'];

const DEFAULT_KEEP_EXPIRY_MINUTES = 120;

const COMMENT_COMMAND_SORT_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'deadline',
  'platform',
  'stance',
  'status',
]);

const COMMENT_COMMAND_INCLUDE = {
  campaign: {
    select: {
      id: true,
      name: true,
      status: true,
      startDate: true,
      endDate: true,
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
  createdBy: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  },
  _count: {
    select: {
      tasks: true,
    },
  },
} satisfies Prisma.CommentCommandInclude;

type CommentCommandWithRelations = Prisma.CommentCommandGetPayload<{
  include: typeof COMMENT_COMMAND_INCLUDE;
}>;

type SlotCounts = {
  requiredSlots: number;
  availableSlots: number;
  keptSlots: number;
  inProgressSlots: number;
  completedSlots: number;
  releasedSlots: number;
  expiredSlots: number;
  cancelledSlots: number;
};

function commandOrderBy(
  query: CommentCommandQueryDto,
): Prisma.CommentCommandOrderByWithRelationInput {
  const sortBy = COMMENT_COMMAND_SORT_FIELDS.has(query.sortBy)
    ? query.sortBy
    : 'createdAt';

  return { [sortBy]: query.sortOrder };
}

function toDateRangeFilter(
  query: CommentCommandQueryDto,
): Prisma.DateTimeFilter | undefined {
  if (!query.dateFrom && !query.dateTo) {
    return undefined;
  }

  return {
    ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
    ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
  };
}

function zeroSlotCounts(requiredSlots: number): SlotCounts {
  return {
    requiredSlots,
    availableSlots: 0,
    keptSlots: 0,
    inProgressSlots: 0,
    completedSlots: 0,
    releasedSlots: 0,
    expiredSlots: 0,
    cancelledSlots: 0,
  };
}

@Injectable()
export class CommentCommandsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(campaignId: string, query: CommentCommandQueryDto) {
    await this.ensureCampaignExists(campaignId);
    await this.expireStaleTasks({ campaignId });

    const createdAt = toDateRangeFilter(query);
    const where: Prisma.CommentCommandWhereInput = {
      campaignId,
      deletedAt: null,
      ...(query.stance ? { stance: query.stance } : {}),
      ...(query.platform ? { platform: query.platform } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(createdAt ? { createdAt } : {}),
      ...(query.search
        ? {
            OR: [
              { targetPostUrl: { contains: query.search } },
              { narrative: { contains: query.search } },
              { instruction: { contains: query.search } },
              { socialAccount: { username: { contains: query.search } } },
              { socialAccount: { displayName: { contains: query.search } } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.commentCommand.findMany({
        where,
        orderBy: commandOrderBy(query),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: COMMENT_COMMAND_INCLUDE,
      }),
      this.prisma.commentCommand.count({ where }),
    ]);
    const countMap = await this.getSlotCountMap(items);

    return {
      items: items.map((item) =>
        this.toCommandResponse(item, countMap.get(item.id)),
      ),
      meta: buildPaginationMeta(query.page, query.limit, total),
    };
  }

  async create(
    user: CurrentUser,
    campaignId: string,
    dto: CreateCommentCommandDto,
    auditContext?: RequestAuditContext,
  ) {
    await this.ensureCampaignExists(campaignId);
    await this.validateSocialAccount(dto.socialAccountId, dto.platform);

    const status = dto.status ?? CommentCommandStatus.ACTIVE;
    const keepExpiryMinutes =
      dto.keepExpiryMinutes ?? DEFAULT_KEEP_EXPIRY_MINUTES;

    const command = await this.prisma.$transaction(async (tx) => {
      const created = await tx.commentCommand.create({
        data: {
          campaignId,
          socialAccountId: dto.socialAccountId,
          targetPostUrl: dto.targetPostUrl,
          platform: dto.platform,
          stance: dto.stance,
          narrative: dto.narrative,
          instruction: dto.instruction,
          requiredSlots: dto.requiredSlots,
          keepExpiryMinutes,
          deadline: new Date(dto.deadline),
          status,
          createdById: user.id,
        },
        include: COMMENT_COMMAND_INCLUDE,
      });

      if (status === CommentCommandStatus.ACTIVE) {
        await tx.commentTask.createMany({
          data: Array.from({ length: dto.requiredSlots }, (_, index) => ({
            commentCommandId: created.id,
            taskNo: index + 1,
            status: CommentTaskStatus.AVAILABLE,
          })),
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          campaignId,
          action: AuditAction.COMMENT_COMMAND_CREATED,
          entityType: 'CommentCommand',
          entityId: created.id,
          newValue: toAuditJson({
            ...created,
            createdSlots:
              status === CommentCommandStatus.ACTIVE ? dto.requiredSlots : 0,
          }),
          ipAddress: auditContext?.ipAddress,
          userAgent: auditContext?.userAgent,
        },
      });

      return created;
    });

    const slotCounts = await this.getSlotCounts(
      command.id,
      command.requiredSlots,
    );
    return this.toCommandResponse(command, slotCounts);
  }

  async findOne(commandId: string) {
    await this.expireStaleTasks({ commandId });
    const command = await this.findExistingCommand(commandId);
    const slotCounts = await this.getSlotCounts(
      command.id,
      command.requiredSlots,
    );

    return this.toCommandResponse(command, slotCounts);
  }

  async update(
    user: CurrentUser,
    commandId: string,
    dto: UpdateCommentCommandDto,
    auditContext?: RequestAuditContext,
  ) {
    const current = await this.findExistingCommand(commandId);
    const nextPlatform = dto.platform ?? current.platform;
    const nextSocialAccountId =
      dto.socialAccountId === undefined
        ? current.socialAccountId
        : dto.socialAccountId;

    await this.validateSocialAccount(
      nextSocialAccountId ?? undefined,
      nextPlatform,
    );

    const updated = await this.prisma.$transaction(async (tx) => {
      const existingTaskCount = await tx.commentTask.count({
        where: { commentCommandId: commandId },
      });
      const nextRequiredSlots = dto.requiredSlots ?? current.requiredSlots;

      if (nextRequiredSlots < existingTaskCount) {
        throw new ConflictException({
          code: 'COMMENT_COMMAND_SLOT_COUNT_TOO_LOW',
          message:
            'requiredSlots cannot be lower than the existing number of comment tasks.',
          details: [],
        });
      }

      const next = await tx.commentCommand.update({
        where: { id: commandId },
        data: {
          ...(dto.socialAccountId !== undefined
            ? { socialAccountId: dto.socialAccountId }
            : {}),
          ...(dto.targetPostUrl !== undefined
            ? { targetPostUrl: dto.targetPostUrl }
            : {}),
          ...(dto.platform !== undefined ? { platform: dto.platform } : {}),
          ...(dto.stance !== undefined ? { stance: dto.stance } : {}),
          ...(dto.narrative !== undefined ? { narrative: dto.narrative } : {}),
          ...(dto.instruction !== undefined
            ? { instruction: dto.instruction }
            : {}),
          ...(dto.requiredSlots !== undefined
            ? { requiredSlots: dto.requiredSlots }
            : {}),
          ...(dto.keepExpiryMinutes !== undefined
            ? { keepExpiryMinutes: dto.keepExpiryMinutes }
            : {}),
          ...(dto.deadline !== undefined
            ? { deadline: new Date(dto.deadline) }
            : {}),
        },
        include: COMMENT_COMMAND_INCLUDE,
      });

      if (
        next.status === CommentCommandStatus.ACTIVE &&
        next.requiredSlots > existingTaskCount
      ) {
        await this.createMissingSlots(
          tx,
          next.id,
          existingTaskCount + 1,
          next.requiredSlots,
        );
      }

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          campaignId: next.campaignId,
          action: AuditAction.COMMENT_COMMAND_UPDATED,
          entityType: 'CommentCommand',
          entityId: next.id,
          oldValue: toAuditJson(current),
          newValue: toAuditJson(next),
          ipAddress: auditContext?.ipAddress,
          userAgent: auditContext?.userAgent,
        },
      });

      return next;
    });

    const slotCounts = await this.getSlotCounts(
      updated.id,
      updated.requiredSlots,
    );
    return this.toCommandResponse(updated, slotCounts);
  }

  async updateStatus(
    user: CurrentUser,
    commandId: string,
    dto: UpdateCommentCommandStatusDto,
    auditContext?: RequestAuditContext,
  ) {
    const current = await this.findExistingCommand(commandId);

    const updated = await this.prisma.$transaction(async (tx) => {
      const existingTaskCount = await tx.commentTask.count({
        where: { commentCommandId: commandId },
      });

      if (
        dto.status === CommentCommandStatus.ACTIVE &&
        existingTaskCount < current.requiredSlots
      ) {
        await this.createMissingSlots(
          tx,
          commandId,
          existingTaskCount + 1,
          current.requiredSlots,
        );
      }

      const next = await tx.commentCommand.update({
        where: { id: commandId },
        data: { status: dto.status },
        include: COMMENT_COMMAND_INCLUDE,
      });

      const action =
        dto.status === CommentCommandStatus.PAUSED
          ? AuditAction.COMMENT_COMMAND_PAUSED
          : dto.status === CommentCommandStatus.ARCHIVED
            ? AuditAction.COMMENT_COMMAND_ARCHIVED
            : AuditAction.COMMENT_COMMAND_UPDATED;

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          campaignId: next.campaignId,
          action,
          entityType: 'CommentCommand',
          entityId: next.id,
          oldValue: toAuditJson(current),
          newValue: toAuditJson(next),
          ipAddress: auditContext?.ipAddress,
          userAgent: auditContext?.userAgent,
        },
      });

      return next;
    });

    const slotCounts = await this.getSlotCounts(
      updated.id,
      updated.requiredSlots,
    );
    return this.toCommandResponse(updated, slotCounts);
  }

  async assign(
    _user: CurrentUser,
    _commandId: string,
    _dto: AssignCommentCommandDto,
    _auditContext?: RequestAuditContext,
  ) {
    throw new ConflictException({
      code: 'COMMENT_COMMAND_ASSIGN_DEPRECATED',
      message:
        'Manual assignment is deprecated. Comment tasks must be kept by Buzzers from the comment queue.',
      details: [],
    });
  }

  private async createMissingSlots(
    tx: Prisma.TransactionClient,
    commandId: string,
    fromTaskNo: number,
    toTaskNo: number,
  ) {
    if (fromTaskNo > toTaskNo) {
      return;
    }

    await tx.commentTask.createMany({
      data: Array.from({ length: toTaskNo - fromTaskNo + 1 }, (_, index) => ({
        commentCommandId: commandId,
        taskNo: fromTaskNo + index,
        status: CommentTaskStatus.AVAILABLE,
      })),
      skipDuplicates: true,
    });
  }

  private toCommandResponse(
    command: CommentCommandWithRelations,
    slotCounts?: SlotCounts,
  ) {
    const counts = slotCounts ?? zeroSlotCounts(command.requiredSlots);

    return {
      id: command.id,
      campaignId: command.campaignId,
      campaign: command.campaign,
      targetPostUrl: command.targetPostUrl,
      platform: command.platform,
      socialAccountId: command.socialAccountId,
      socialAccount: command.socialAccount,
      stance: command.stance,
      narrative: command.narrative,
      instruction: command.instruction,
      requiredSlots: command.requiredSlots,
      keepExpiryMinutes: command.keepExpiryMinutes,
      deadline: command.deadline,
      status: command.status,
      createdBy: command.createdBy,
      createdAt: command.createdAt,
      updatedAt: command.updatedAt,
      taskCount: command._count.tasks,
      slotCounts: counts,
    };
  }

  private async findExistingCommand(commandId: string) {
    const command = await this.prisma.commentCommand.findFirst({
      where: {
        id: commandId,
        deletedAt: null,
        campaign: {
          deletedAt: null,
        },
      },
      include: COMMENT_COMMAND_INCLUDE,
    });

    if (!command) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Comment command not found.',
        details: [],
      });
    }

    return command;
  }

  private async getSlotCountMap(commands: CommentCommandWithRelations[]) {
    const commandIds = commands.map((command) => command.id);
    const map = new Map<string, SlotCounts>();

    for (const command of commands) {
      map.set(command.id, zeroSlotCounts(command.requiredSlots));
    }

    if (commandIds.length === 0) {
      return map;
    }

    const grouped = await this.prisma.commentTask.groupBy({
      by: ['commentCommandId', 'status'],
      where: { commentCommandId: { in: commandIds } },
      _count: { _all: true },
    });

    for (const item of grouped) {
      const counts = map.get(item.commentCommandId);
      if (!counts) {
        continue;
      }

      this.applyStatusCount(counts, item.status, item._count._all);
    }

    return map;
  }

  private async getSlotCounts(commandId: string, requiredSlots: number) {
    const grouped = await this.prisma.commentTask.groupBy({
      by: ['status'],
      where: { commentCommandId: commandId },
      _count: { _all: true },
    });
    const counts = zeroSlotCounts(requiredSlots);

    for (const item of grouped) {
      this.applyStatusCount(counts, item.status, item._count._all);
    }

    return counts;
  }

  private applyStatusCount(
    counts: SlotCounts,
    status: CommentTaskStatus,
    count: number,
  ) {
    switch (status) {
      case CommentTaskStatus.AVAILABLE:
        counts.availableSlots = count;
        break;
      case CommentTaskStatus.KEPT:
        counts.keptSlots = count;
        break;
      case CommentTaskStatus.IN_PROGRESS:
        counts.inProgressSlots = count;
        break;
      case CommentTaskStatus.COMPLETED:
        counts.completedSlots = count;
        break;
      case CommentTaskStatus.RELEASED:
        counts.releasedSlots = count;
        break;
      case CommentTaskStatus.EXPIRED:
        counts.expiredSlots = count;
        break;
      case CommentTaskStatus.CANCELLED:
        counts.cancelledSlots = count;
        break;
    }
  }

  private async expireStaleTasks(filter: {
    campaignId?: string;
    commandId?: string;
  }) {
    const now = new Date();
    const tasks = await this.prisma.commentTask.findMany({
      where: {
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

    await this.prisma.$transaction(
      tasks.map((task) =>
        this.prisma.commentTask.update({
          where: { id: task.id },
          data: { status: CommentTaskStatus.EXPIRED },
        }),
      ),
    );

    await this.prisma.auditLog.createMany({
      data: tasks.map((task) => ({
        campaignId: task.command.campaignId,
        action: AuditAction.COMMENT_TASK_EXPIRED,
        entityType: 'CommentTask',
        entityId: task.id,
        oldValue: toAuditJson(task),
        newValue: toAuditJson({ ...task, status: CommentTaskStatus.EXPIRED }),
      })),
    });
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

  private async validateSocialAccount(
    socialAccountId: string | undefined,
    platform: CreateCommentCommandDto['platform'],
  ) {
    if (!socialAccountId) {
      return;
    }

    const socialAccount = await this.prisma.socialAccount.findFirst({
      where: {
        id: socialAccountId,
        deletedAt: null,
      },
      select: {
        id: true,
        platform: true,
        status: true,
      },
    });

    if (!socialAccount) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Social account not found.',
        details: [],
      });
    }

    if (socialAccount.status !== SocialAccountStatus.ACTIVE) {
      throw new ConflictException({
        code: 'SOCIAL_ACCOUNT_INACTIVE',
        message: 'Inactive social account cannot be used for comment command.',
        details: [],
      });
    }

    if (socialAccount.platform !== platform) {
      throw new BadRequestException({
        code: 'PLATFORM_MISMATCH',
        message: 'Comment command platform must match social account platform.',
        details: [],
      });
    }
  }
}
