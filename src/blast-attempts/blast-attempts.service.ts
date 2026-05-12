import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  BlastAttemptStatus,
  BlastTargetStatus,
  CampaignStatus,
  Prisma,
  ReviewStatus,
  UserRole,
} from '../generated/prisma/client.js';
import { buildPaginationMeta } from '../common/dto/pagination-query.dto.js';
import { toAuditJson } from '../common/utils/audit-json.js';
import type { RequestAuditContext } from '../common/utils/request-audit-context.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditLogService } from '../audit-logs/audit-log.service.js';
import type { RossUserSession } from '../auth/auth.types.js';
import {
  BlastAttemptQueryDto,
  BuzzerBlastQueueQueryDto,
  KeepBlastAttemptDto,
} from './dto/index.js';

type CurrentUser = RossUserSession['user'];

const DEFAULT_KEEP_DURATION_MINUTES = 120;
const ATTEMPT_SORT_FIELDS = new Set([
  'attemptNo',
  'status',
  'keptAt',
  'keepExpiresAt',
  'completedAt',
  'createdAt',
  'updatedAt',
]);

function attemptOrderBy(
  query: BlastAttemptQueryDto | BuzzerBlastQueueQueryDto,
): Prisma.BlastAttemptOrderByWithRelationInput {
  const sortBy = ATTEMPT_SORT_FIELDS.has(query.sortBy)
    ? query.sortBy
    : 'createdAt';

  return { [sortBy]: query.sortOrder };
}

@Injectable()
export class BlastAttemptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogService,
  ) {}

  async findForTarget(
    user: CurrentUser,
    campaignId: string,
    blastTargetId: string,
    query: BlastAttemptQueryDto,
  ) {
    await this.ensureCampaignAccess(user, campaignId);
    await this.ensureTargetInCampaign(campaignId, blastTargetId);

    const where: Prisma.BlastAttemptWhereInput = {
      blastTargetId,
      ...(query.status ? { status: query.status } : {}),
      ...(user.role === UserRole.BUZZER
        ? {
            OR: [
              { status: BlastAttemptStatus.AVAILABLE },
              { keptById: user.id },
            ],
            blastTarget: {
              status: BlastTargetStatus.ACTIVE,
              reviewStatus: ReviewStatus.APPROVED,
            },
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.blastAttempt.findMany({
        where,
        orderBy: attemptOrderBy(query),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: this.defaultInclude(),
      }),
      this.prisma.blastAttempt.count({ where }),
    ]);

    return {
      items,
      meta: buildPaginationMeta(query.page, query.limit, total),
    };
  }

  async getBlastQueue(user: CurrentUser, query: BuzzerBlastQueueQueryDto) {
    const where: Prisma.BlastAttemptWhereInput = {
      status: BlastAttemptStatus.AVAILABLE,
      blastTarget: {
        deletedAt: null,
        status: BlastTargetStatus.ACTIVE,
        reviewStatus: ReviewStatus.APPROVED,
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

    const [items, total] = await this.prisma.$transaction([
      this.prisma.blastAttempt.findMany({
        where,
        orderBy: attemptOrderBy(query),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: this.defaultInclude(),
      }),
      this.prisma.blastAttempt.count({ where }),
    ]);

    return {
      items,
      meta: buildPaginationMeta(query.page, query.limit, total),
    };
  }

  async getMyKept(user: CurrentUser, query: BuzzerBlastQueueQueryDto) {
    const where: Prisma.BlastAttemptWhereInput = {
      keptById: user.id,
      status: BlastAttemptStatus.KEPT,
      blastTarget: {
        deletedAt: null,
        status: BlastTargetStatus.ACTIVE,
        reviewStatus: ReviewStatus.APPROVED,
        ...(query.platform ? { platform: query.platform } : {}),
        campaign: {
          deletedAt: null,
        },
      },
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.blastAttempt.findMany({
        where,
        orderBy: attemptOrderBy(query),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: this.defaultInclude(),
      }),
      this.prisma.blastAttempt.count({ where }),
    ]);

    return {
      items,
      meta: buildPaginationMeta(query.page, query.limit, total),
    };
  }

  async keep(
    user: CurrentUser,
    attemptId: string,
    dto?: KeepBlastAttemptDto,
    auditContext?: RequestAuditContext,
  ) {
    const attempt = await this.findAttemptWithCampaign(attemptId);
    await this.ensureCampaignAccess(user, attempt.blastTarget.campaignId);
    this.ensureAttemptEligibleForKeep(attempt);

    const keepDurationMinutes =
      dto?.keepDurationMinutes ?? DEFAULT_KEEP_DURATION_MINUTES;
    const now = new Date();
    const keepExpiresAt = new Date(
      now.getTime() + keepDurationMinutes * 60 * 1000,
    );

    const kept = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.blastAttempt.updateMany({
        where: {
          id: attemptId,
          status: BlastAttemptStatus.AVAILABLE,
          blastTarget: {
            deletedAt: null,
            status: BlastTargetStatus.ACTIVE,
            reviewStatus: ReviewStatus.APPROVED,
            campaign: {
              deletedAt: null,
              status: CampaignStatus.ACTIVE,
            },
          },
        },
        data: {
          status: BlastAttemptStatus.KEPT,
          keptById: user.id,
          keptAt: now,
          keepExpiresAt,
        },
      });

      if (updated.count === 0) {
        throw await this.buildAttemptUnavailableError(attemptId);
      }

      const updatedAttempt = await tx.blastAttempt.findUniqueOrThrow({
        where: { id: attemptId },
        include: this.defaultInclude(),
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          campaignId: attempt.blastTarget.campaignId,
          action: AuditAction.BLAST_ATTEMPT_KEPT,
          entityType: 'BlastAttempt',
          entityId: attemptId,
          oldValue: toAuditJson(attempt),
          newValue: toAuditJson(updatedAttempt),
          ipAddress: auditContext?.ipAddress,
          userAgent: auditContext?.userAgent,
        },
      });

      return updatedAttempt;
    });

    return kept;
  }

  async release(
    user: CurrentUser,
    attemptId: string,
    auditContext?: RequestAuditContext,
  ) {
    const attempt = await this.findAttemptWithCampaign(attemptId);

    if (user.role === UserRole.BUZZER) {
      await this.ensureCampaignAccess(user, attempt.blastTarget.campaignId);

      if (attempt.keptById !== user.id) {
        throw new ForbiddenException({
          code: 'ATTEMPT_NOT_OWNED',
          message: 'Only the buzzer who kept this attempt can release it.',
          details: [],
        });
      }
    }

    if (attempt.status !== BlastAttemptStatus.KEPT) {
      throw new ConflictException({
        code: 'ATTEMPT_INVALID_STATUS',
        message: 'Only kept attempts can be released.',
        details: [],
      });
    }

    const released = await this.prisma.blastAttempt.update({
      where: { id: attemptId },
      data: {
        status: BlastAttemptStatus.RELEASED,
        keepExpiresAt: null,
      },
      include: this.defaultInclude(),
    });

    await this.auditLogs.create({
      actorId: user.id,
      campaignId: attempt.blastTarget.campaignId,
      action: AuditAction.BLAST_ATTEMPT_RELEASED,
      entityType: 'BlastAttempt',
      entityId: attemptId,
      oldValue: toAuditJson(attempt),
      newValue: toAuditJson(released),
      ipAddress: auditContext?.ipAddress,
      userAgent: auditContext?.userAgent,
    });

    return released;
  }

  private defaultInclude() {
    return {
      keptBy: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
      report: true,
      blastTarget: {
        include: {
          campaign: true,
          socialAccount: true,
        },
      },
    } satisfies Prisma.BlastAttemptInclude;
  }

  private async findAttemptWithCampaign(attemptId: string) {
    const attempt = await this.prisma.blastAttempt.findUnique({
      where: { id: attemptId },
      include: this.defaultInclude(),
    });

    if (!attempt || attempt.blastTarget.deletedAt) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Blast attempt not found.',
        details: [],
      });
    }

    return attempt;
  }

  private async ensureTargetInCampaign(
    campaignId: string,
    blastTargetId: string,
  ) {
    const target = await this.prisma.blastTarget.findFirst({
      where: {
        id: blastTargetId,
        campaignId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!target) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Blast target not found.',
        details: [],
      });
    }
  }

  private async ensureCampaignAccess(user: CurrentUser, campaignId: string) {
    if (user.role === UserRole.ADMIN) {
      return;
    }

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

  private async buildAttemptUnavailableError(attemptId: string) {
    const latest = await this.prisma.blastAttempt.findUnique({
      where: { id: attemptId },
      select: {
        status: true,
        keptById: true,
        blastTarget: {
          select: {
            status: true,
            reviewStatus: true,
            deletedAt: true,
            campaign: {
              select: {
                status: true,
                deletedAt: true,
              },
            },
          },
        },
      },
    });

    if (
      latest?.blastTarget.deletedAt ||
      latest?.blastTarget.status !== BlastTargetStatus.ACTIVE ||
      latest?.blastTarget.reviewStatus !== ReviewStatus.APPROVED ||
      latest?.blastTarget.campaign.deletedAt ||
      latest?.blastTarget.campaign.status !== CampaignStatus.ACTIVE
    ) {
      return new ConflictException({
        code: 'ATTEMPT_NOT_ELIGIBLE',
        message: 'Blast attempt is not eligible to be kept.',
        details: [],
      });
    }

    if (latest?.status === BlastAttemptStatus.KEPT) {
      return new ConflictException({
        code: 'ATTEMPT_ALREADY_KEPT',
        message: 'Blast attempt is already kept by another buzzer.',
        details: [],
      });
    }

    return new ConflictException({
      code: 'ATTEMPT_NOT_AVAILABLE',
      message: 'Blast attempt is not available.',
      details: [],
    });
  }

  private ensureAttemptEligibleForKeep(
    attempt: Awaited<
      ReturnType<BlastAttemptsService['findAttemptWithCampaign']>
    >,
  ) {
    if (
      attempt.blastTarget.status !== BlastTargetStatus.ACTIVE ||
      attempt.blastTarget.reviewStatus !== ReviewStatus.APPROVED ||
      attempt.blastTarget.campaign.status !== CampaignStatus.ACTIVE ||
      attempt.blastTarget.campaign.deletedAt
    ) {
      throw new ConflictException({
        code: 'ATTEMPT_NOT_ELIGIBLE',
        message: 'Blast attempt is not eligible to be kept.',
        details: [],
      });
    }
  }
}
