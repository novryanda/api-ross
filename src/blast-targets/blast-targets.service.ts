import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  BlastAttemptStatus,
  BlastSourceType,
  BlastTargetStatus,
  CampaignStatus,
  Prisma,
  ReviewStatus,
  SocialAccountStatus,
  UserRole,
} from '../generated/prisma/client.js';
import { buildPaginationMeta } from '../common/dto/pagination-query.dto.js';
import { toAuditJson } from '../common/utils/audit-json.js';
import type { RequestAuditContext } from '../common/utils/request-audit-context.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditLogService } from '../audit-logs/audit-log.service.js';
import type { RossUserSession } from '../auth/auth.types.js';
import {
  BlastTargetQueryDto,
  CreateBlastTargetDto,
  UpdateBlastTargetDto,
  UpdateBlastTargetStatusDto,
} from './dto/index.js';

type CurrentUser = RossUserSession['user'];

const BLAST_TARGET_SORT_FIELDS = new Set([
  'platform',
  'status',
  'reviewStatus',
  'createdAt',
  'updatedAt',
]);

function blastTargetOrderBy(
  query: BlastTargetQueryDto,
): Prisma.BlastTargetOrderByWithRelationInput {
  const sortBy = BLAST_TARGET_SORT_FIELDS.has(query.sortBy)
    ? query.sortBy
    : 'createdAt';

  return { [sortBy]: query.sortOrder };
}

@Injectable()
export class BlastTargetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogService,
  ) {}

  async findAll(
    user: CurrentUser,
    campaignId: string,
    query: BlastTargetQueryDto,
  ) {
    await this.ensureCampaignAccess(user, campaignId);

    const where: Prisma.BlastTargetWhereInput = {
      campaignId,
      deletedAt: null,
      ...(query.platform ? { platform: query.platform } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.reviewStatus ? { reviewStatus: query.reviewStatus } : {}),
      ...(user.role === UserRole.BUZZER
        ? {
            status: BlastTargetStatus.ACTIVE,
            reviewStatus: ReviewStatus.APPROVED,
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { postUrl: { contains: query.search } },
              { socialAccount: { username: { contains: query.search } } },
              { socialAccount: { displayName: { contains: query.search } } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.blastTarget.findMany({
        where,
        orderBy: blastTargetOrderBy(query),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: this.defaultInclude(),
      }),
      this.prisma.blastTarget.count({ where }),
    ]);

    return {
      items,
      meta: buildPaginationMeta(query.page, query.limit, total),
    };
  }

  async create(
    user: CurrentUser,
    campaignId: string,
    dto: CreateBlastTargetDto,
  ) {
    await this.ensureCampaignExists(campaignId);
    await this.ensureUniquePostUrl(campaignId, dto.postUrl);
    await this.validateSourceAccount(dto.socialAccountId, dto.platform);

    const target = await this.prisma.$transaction(async (tx) => {
      const created = await tx.blastTarget.create({
        data: {
          campaignId,
          socialAccountId: dto.socialAccountId,
          postUrl: dto.postUrl,
          platform: dto.platform,
          instruction: dto.instruction,
          submittedById: user.id,
          sourceType: dto.sourceType ?? BlastSourceType.ADMIN_SUBMITTED,
          reviewStatus: dto.reviewStatus ?? ReviewStatus.APPROVED,
          status: dto.status ?? BlastTargetStatus.ACTIVE,
          attempts: {
            create: {
              attemptNo: 1,
              status: BlastAttemptStatus.AVAILABLE,
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          campaignId,
          action: AuditAction.BLAST_TARGET_CREATED,
          entityType: 'BlastTarget',
          entityId: created.id,
          newValue: toAuditJson(created),
        },
      });

      const attempt = await tx.blastAttempt.findUnique({
        where: {
          blastTargetId_attemptNo: {
            blastTargetId: created.id,
            attemptNo: 1,
          },
        },
      });

      if (attempt) {
        await tx.auditLog.create({
          data: {
            actorId: user.id,
            campaignId,
            action: AuditAction.BLAST_ATTEMPT_CREATED,
            entityType: 'BlastAttempt',
            entityId: attempt.id,
            newValue: toAuditJson(attempt),
          },
        });
      }

      return created;
    });

    return this.findOne(user, campaignId, target.id);
  }

  async findOne(user: CurrentUser, campaignId: string, blastTargetId: string) {
    await this.ensureCampaignAccess(user, campaignId);
    const attemptsWhere =
      user.role === UserRole.ADMIN
        ? {}
        : user.role === UserRole.BUZZER
          ? {
              OR: [
                { status: BlastAttemptStatus.AVAILABLE },
                { keptById: user.id },
              ],
            }
          : {
              id: { equals: '00000000-0000-0000-0000-000000000000' },
            };

    const target = await this.prisma.blastTarget.findFirst({
      where: {
        id: blastTargetId,
        campaignId,
        deletedAt: null,
        ...(user.role === UserRole.BUZZER
          ? {
              status: BlastTargetStatus.ACTIVE,
              reviewStatus: ReviewStatus.APPROVED,
            }
          : {}),
      },
      include: {
        ...this.defaultInclude(),
        attempts: {
          where: attemptsWhere,
          orderBy: { attemptNo: 'desc' },
          include: {
            keptBy: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
              },
            },
            report: true,
          },
        },
      },
    });

    if (!target) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Blast target not found.',
        details: [],
      });
    }

    return target;
  }

  async update(
    user: CurrentUser,
    campaignId: string,
    blastTargetId: string,
    dto: UpdateBlastTargetDto,
  ) {
    const current = await this.findExistingTarget(campaignId, blastTargetId);
    const nextSocialAccountId = dto.socialAccountId ?? current.socialAccountId;
    const nextPlatform = dto.platform ?? current.platform;
    const nextPostUrl = dto.postUrl ?? current.postUrl;

    if (nextPostUrl !== current.postUrl) {
      await this.ensureUniquePostUrl(campaignId, nextPostUrl, blastTargetId);
    }

    if (
      nextSocialAccountId !== current.socialAccountId ||
      nextPlatform !== current.platform
    ) {
      await this.validateSourceAccount(nextSocialAccountId, nextPlatform);
    }

    const updated = await this.prisma.blastTarget.update({
      where: { id: blastTargetId },
      data: {
        ...(dto.socialAccountId !== undefined
          ? { socialAccountId: dto.socialAccountId }
          : {}),
        ...(dto.platform !== undefined ? { platform: dto.platform } : {}),
        ...(dto.postUrl !== undefined ? { postUrl: dto.postUrl } : {}),
        ...(dto.instruction !== undefined
          ? { instruction: dto.instruction }
          : {}),
      },
    });

    await this.auditLogs.create({
      actorId: user.id,
      campaignId,
      action: AuditAction.BLAST_TARGET_UPDATED,
      entityType: 'BlastTarget',
      entityId: updated.id,
      oldValue: toAuditJson(current),
      newValue: toAuditJson(updated),
    });

    return updated;
  }

  async updateStatus(
    user: CurrentUser,
    campaignId: string,
    blastTargetId: string,
    dto: UpdateBlastTargetStatusDto,
  ) {
    const current = await this.findExistingTarget(campaignId, blastTargetId);

    const updated = await this.prisma.blastTarget.update({
      where: { id: blastTargetId },
      data: {
        status: dto.status,
      },
    });

    await this.auditLogs.create({
      actorId: user.id,
      campaignId,
      action: AuditAction.BLAST_TARGET_STATUS_UPDATED,
      entityType: 'BlastTarget',
      entityId: updated.id,
      oldValue: toAuditJson(current),
      newValue: toAuditJson(updated),
    });

    return updated;
  }

  async reblast(
    user: CurrentUser,
    campaignId: string,
    blastTargetId: string,
    auditContext?: RequestAuditContext,
  ) {
    const target = await this.findExistingTarget(campaignId, blastTargetId);
    this.ensureReblastAllowed(target);

    const attempt = await this.prisma.$transaction(
      async (tx) => {
        const lastAttempt = await tx.blastAttempt.findFirst({
          where: { blastTargetId },
          orderBy: { attemptNo: 'desc' },
          select: { attemptNo: true },
        });

        const created = await tx.blastAttempt.create({
          data: {
            blastTargetId,
            attemptNo: (lastAttempt?.attemptNo ?? 0) + 1,
            status: BlastAttemptStatus.AVAILABLE,
          },
          include: {
            blastTarget: {
              include: {
                socialAccount: true,
                campaign: true,
              },
            },
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: user.id,
            campaignId,
            action: AuditAction.REBLAST_ATTEMPT_CREATED,
            entityType: 'BlastAttempt',
            entityId: created.id,
            newValue: toAuditJson(created),
            ipAddress: auditContext?.ipAddress,
            userAgent: auditContext?.userAgent,
          },
        });

        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return attempt;
  }

  private defaultInclude() {
    return {
      socialAccount: true,
      submittedBy: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
      _count: {
        select: {
          attempts: true,
        },
      },
      attempts: {
        orderBy: { attemptNo: 'desc' },
        include: {
          keptBy: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
          report: true,
        },
      },
    } satisfies Prisma.BlastTargetInclude;
  }

  private async findExistingTarget(campaignId: string, blastTargetId: string) {
    await this.ensureCampaignExists(campaignId);

    const target = await this.prisma.blastTarget.findFirst({
      where: {
        id: blastTargetId,
        campaignId,
        deletedAt: null,
      },
      include: {
        campaign: true,
      },
    });

    if (!target) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Blast target not found.',
        details: [],
      });
    }

    return target;
  }

  private ensureReblastAllowed(
    target: Awaited<ReturnType<BlastTargetsService['findExistingTarget']>>,
  ) {
    if (
      target.status !== BlastTargetStatus.ACTIVE ||
      target.campaign.deletedAt ||
      target.campaign.status === CampaignStatus.ARCHIVED
    ) {
      throw new ConflictException({
        code: 'REBLAST_NOT_ALLOWED',
        message:
          'Only active blast targets in active campaigns can be reblasted.',
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

  private async ensureCampaignAccess(user: CurrentUser, campaignId: string) {
    await this.ensureCampaignExists(campaignId);

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
      select: { id: true },
    });

    if (!membership) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Campaign access denied.',
        details: [],
      });
    }
  }

  private async validateSourceAccount(
    socialAccountId: string,
    platform: CreateBlastTargetDto['platform'],
  ) {
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
        message: 'Inactive social account cannot be used for blast target.',
        details: [],
      });
    }

    if (socialAccount.platform !== platform) {
      throw new BadRequestException({
        code: 'PLATFORM_MISMATCH',
        message: 'Blast target platform must match social account platform.',
        details: [],
      });
    }
  }

  private async ensureUniquePostUrl(
    campaignId: string,
    postUrl: string,
    ignoredId?: string,
  ) {
    const existing = await this.prisma.blastTarget.findUnique({
      where: {
        campaignId_postUrl: {
          campaignId,
          postUrl,
        },
      },
      select: { id: true },
    });

    if (existing && existing.id !== ignoredId) {
      throw new ConflictException({
        code: 'DUPLICATE_RESOURCE',
        message: 'Blast target already exists in this campaign.',
        details: [],
      });
    }
  }
}
