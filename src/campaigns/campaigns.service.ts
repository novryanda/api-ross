import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  BlastAttemptStatus,
  CampaignMemberRole,
  CampaignStatus,
  CommentStance,
  CommentTaskStatus,
  Platform,
  Prisma,
  UserRole,
} from '../generated/prisma/client.js';
import { buildPaginationMeta } from '../common/dto/pagination-query.dto.js';
import { toAuditJson } from '../common/utils/audit-json.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditLogService } from '../audit-logs/audit-log.service.js';
import type { RossUserSession } from '../auth/auth.types.js';
import {
  CampaignDashboardQueryDto,
  CampaignQueryDto,
  CreateCampaignDto,
  UpdateCampaignDto,
} from './dto/index.js';

type CurrentUser = RossUserSession['user'];

const CAMPAIGN_SORT_FIELDS = new Set([
  'name',
  'status',
  'startDate',
  'endDate',
  'createdAt',
  'updatedAt',
]);

function campaignOrderBy(
  query: CampaignQueryDto,
): Prisma.CampaignOrderByWithRelationInput {
  const sortBy = CAMPAIGN_SORT_FIELDS.has(query.sortBy)
    ? query.sortBy
    : 'createdAt';

  return { [sortBy]: query.sortOrder };
}

type DashboardReport = Prisma.BlastReportGetPayload<{
  include: {
    submittedBy: {
      select: {
        id: true;
        name: true;
        email: true;
        role: true;
      };
    };
    blastAttempt: {
      include: {
        blastTarget: {
          include: {
            socialAccount: true;
          };
        };
      };
    };
  };
}>;

function dateRangeFilter(
  query: CampaignDashboardQueryDto,
): Prisma.DateTimeFilter | undefined {
  if (!query.dateFrom && !query.dateTo) {
    return undefined;
  }

  return {
    ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
    ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
  };
}

function zeroAttemptCounts(): Record<BlastAttemptStatus, number> {
  return {
    [BlastAttemptStatus.AVAILABLE]: 0,
    [BlastAttemptStatus.KEPT]: 0,
    [BlastAttemptStatus.COMPLETED]: 0,
    [BlastAttemptStatus.RELEASED]: 0,
    [BlastAttemptStatus.EXPIRED]: 0,
    [BlastAttemptStatus.CANCELLED]: 0,
  };
}

function zeroCommentTaskCounts(): Record<CommentTaskStatus, number> {
  return {
    [CommentTaskStatus.AVAILABLE]: 0,
    [CommentTaskStatus.KEPT]: 0,
    [CommentTaskStatus.IN_PROGRESS]: 0,
    [CommentTaskStatus.COMPLETED]: 0,
    [CommentTaskStatus.RELEASED]: 0,
    [CommentTaskStatus.EXPIRED]: 0,
    [CommentTaskStatus.CANCELLED]: 0,
  };
}

function roundPercent(value: number): number {
  return Math.round(value * 100) / 100;
}

function groupCountValue(count: true | { _all?: number } | undefined): number {
  return typeof count === 'object' ? (count._all ?? 0) : 0;
}

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogService,
  ) {}

  async findAll(user: CurrentUser, query: CampaignQueryDto) {
    const where: Prisma.CampaignWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search } },
              { description: { contains: query.search } },
            ],
          }
        : {}),
      ...(user.role === UserRole.ADMIN
        ? {}
        : {
            members: {
              some: {
                userId: user.id,
              },
            },
          }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.campaign.findMany({
        where,
        orderBy: campaignOrderBy(query),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
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
              members: true,
              blastTargets: true,
              commentCommands: true,
            },
          },
          blastTargets: {
            where: { deletedAt: null },
            select: {
              platform: true,
              attempts: {
                select: {
                  status: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.campaign.count({ where }),
    ]);

    return {
      items,
      meta: buildPaginationMeta(query.page, query.limit, total),
    };
  }

  async create(user: CurrentUser, dto: CreateCampaignDto) {
    const campaign = await this.prisma.$transaction(async (tx) => {
      const created = await tx.campaign.create({
        data: {
          name: dto.name,
          description: dto.description,
          startDate: new Date(dto.startDate),
          endDate: dto.endDate ? new Date(dto.endDate) : undefined,
          status: dto.status ?? CampaignStatus.DRAFT,
          platforms: dto.platforms ?? [],
          createdById: user.id,
          members: {
            create: {
              userId: user.id,
              memberRole: CampaignMemberRole.ADMIN,
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: AuditAction.CAMPAIGN_CREATED,
          entityType: 'Campaign',
          entityId: created.id,
          newValue: toAuditJson(created),
        },
      });

      return created;
    });

    return campaign;
  }

  async findOne(user: CurrentUser, id: string) {
    await this.ensureCampaignAccess(user, id);

    const campaign = await this.prisma.campaign.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
                status: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: {
            blastTargets: true,
            commentCommands: true,
            exportReports: true,
          },
        },
      },
    });

    if (!campaign) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Campaign not found.',
        details: [],
      });
    }

    return campaign;
  }

  async getDashboard(
    user: CurrentUser,
    campaignId: string,
    query: CampaignDashboardQueryDto,
  ) {
    const campaign = await this.ensureDashboardAccess(user, campaignId);
    const reportSubmittedAt = dateRangeFilter(query);

    const targetWhere: Prisma.BlastTargetWhereInput = {
      campaignId,
      deletedAt: null,
      ...(query.platform ? { platform: query.platform } : {}),
    };
    const attemptWhere: Prisma.BlastAttemptWhereInput = {
      blastTarget: targetWhere,
    };
    const reportWhere: Prisma.BlastReportWhereInput = {
      ...(reportSubmittedAt ? { submittedAt: reportSubmittedAt } : {}),
      blastAttempt: {
        blastTarget: targetWhere,
      },
    };
    const commandWhere: Prisma.CommentCommandWhereInput = {
      campaignId,
      deletedAt: null,
      ...(query.platform ? { platform: query.platform } : {}),
      ...(reportSubmittedAt ? { createdAt: reportSubmittedAt } : {}),
    };
    const taskWhere: Prisma.CommentTaskWhereInput = {
      ...(reportSubmittedAt ? { createdAt: reportSubmittedAt } : {}),
      command: {
        campaignId,
        deletedAt: null,
        ...(query.platform ? { platform: query.platform } : {}),
        campaign: {
          deletedAt: null,
        },
      },
    };

    const [
      totalTargets,
      attempts,
      reports,
      recentReports,
      commentCommandCounts,
      commentTaskCounts,
      overdueCommentTasks,
    ] = await this.prisma.$transaction([
      this.prisma.blastTarget.count({ where: targetWhere }),
      this.prisma.blastAttempt.findMany({
        where: attemptWhere,
        select: { status: true },
      }),
      this.prisma.blastReport.findMany({
        where: reportWhere,
        include: this.dashboardReportInclude(),
      }),
      this.prisma.blastReport.findMany({
        where: reportWhere,
        orderBy: { submittedAt: 'desc' },
        take: 10,
        include: this.dashboardReportInclude(),
      }),
      this.prisma.commentCommand.groupBy({
        by: ['stance'],
        where: commandWhere,
        orderBy: { stance: 'asc' },
        _count: { _all: true },
      }),
      this.prisma.commentTask.groupBy({
        by: ['status'],
        where: taskWhere,
        orderBy: { status: 'asc' },
        _count: { _all: true },
      }),
      this.prisma.commentTask.count({
        where: {
          ...(reportSubmittedAt ? { createdAt: reportSubmittedAt } : {}),
          status: {
            in: [CommentTaskStatus.KEPT, CommentTaskStatus.IN_PROGRESS],
          },
          command: {
            campaignId,
            deletedAt: null,
            ...(query.platform ? { platform: query.platform } : {}),
            campaign: {
              deletedAt: null,
            },
            deadline: {
              lt: new Date(),
            },
          },
        },
      }),
    ]);

    const attemptCounts = zeroAttemptCounts();
    for (const attempt of attempts) {
      attemptCounts[attempt.status] += 1;
    }

    const commentMetrics = this.buildCommentMetrics(
      commentCommandCounts,
      commentTaskCounts,
      overdueCommentTasks,
    );
    const totalAttempts = Object.values(attemptCounts).reduce(
      (sum, value) => sum + value,
      0,
    );
    const summary = this.buildDashboardSummary(reports, attemptCounts);
    const platformBreakdown = this.buildPlatformBreakdown(reports);
    const topBuzzers = this.buildTopBuzzers(reports);

    return {
      campaign: {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        startDate: campaign.startDate,
        endDate: campaign.endDate,
      },
      summary: {
        ...summary,
        completionRate:
          totalAttempts > 0
            ? roundPercent(
                (attemptCounts[BlastAttemptStatus.COMPLETED] / totalAttempts) *
                  100,
              )
            : 0,
        totalCommentCommands: commentMetrics.totalCommentCommands,
        totalCommentTasks: commentMetrics.totalCommentTasks,
        availableCommentTasks: commentMetrics.availableCommentTasks,
        keptCommentTasks: commentMetrics.keptCommentTasks,
        pendingCommentTasks: commentMetrics.pendingCommentTasks,
        inProgressCommentTasks: commentMetrics.inProgressCommentTasks,
        completedCommentTasks: commentMetrics.completedCommentTasks,
        releasedCommentTasks: commentMetrics.releasedCommentTasks,
        expiredCommentTasks: commentMetrics.expiredCommentTasks,
        cancelledCommentTasks: commentMetrics.cancelledCommentTasks,
        rejectedCommentTasks: commentMetrics.rejectedCommentTasks,
        blockedCommentTasks: commentMetrics.blockedCommentTasks,
        proCommandCount: commentMetrics.proCommandCount,
        kontraCommandCount: commentMetrics.kontraCommandCount,
        overdueCommentTasks: commentMetrics.overdueCommentTasks,
      },
      blast: {
        totalTargets,
        totalAttempts,
        availableAttempts: attemptCounts[BlastAttemptStatus.AVAILABLE],
        keptAttempts: attemptCounts[BlastAttemptStatus.KEPT],
        completedAttempts: attemptCounts[BlastAttemptStatus.COMPLETED],
        releasedAttempts: attemptCounts[BlastAttemptStatus.RELEASED],
        expiredAttempts: attemptCounts[BlastAttemptStatus.EXPIRED],
        cancelledAttempts: attemptCounts[BlastAttemptStatus.CANCELLED],
      },
      comment: commentMetrics,
      platformBreakdown,
      topBuzzers,
      recentReports: recentReports.map((report) =>
        this.toRecentReportResponse(report),
      ),
      recentActivity: [],
    };
  }

  async update(user: CurrentUser, id: string, dto: UpdateCampaignDto) {
    const current = await this.findExistingCampaign(id);

    const updated = await this.prisma.campaign.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.startDate !== undefined
          ? { startDate: new Date(dto.startDate) }
          : {}),
        ...(dto.endDate !== undefined
          ? { endDate: new Date(dto.endDate) }
          : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.platforms !== undefined ? { platforms: dto.platforms } : {}),
      },
    });

    await this.auditLogs.create({
      actorId: user.id,
      action: AuditAction.CAMPAIGN_UPDATED,
      entityType: 'Campaign',
      entityId: updated.id,
      oldValue: toAuditJson(current),
      newValue: toAuditJson(updated),
    });

    return updated;
  }

  async archive(user: CurrentUser, id: string) {
    const current = await this.findExistingCampaign(id);

    const archived = await this.prisma.campaign.update({
      where: { id },
      data: {
        status: CampaignStatus.ARCHIVED,
      },
    });

    await this.auditLogs.create({
      actorId: user.id,
      action: AuditAction.CAMPAIGN_ARCHIVED,
      entityType: 'Campaign',
      entityId: archived.id,
      oldValue: toAuditJson(current),
      newValue: toAuditJson(archived),
    });

    return archived;
  }

  private async findExistingCampaign(id: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!campaign) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Campaign not found.',
        details: [],
      });
    }

    return campaign;
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
          select: {
            deletedAt: true,
          },
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

  private dashboardReportInclude() {
    return {
      submittedBy: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
      blastAttempt: {
        include: {
          blastTarget: {
            include: {
              socialAccount: true,
            },
          },
        },
      },
    } satisfies Prisma.BlastReportInclude;
  }

  private buildDashboardSummary(
    reports: DashboardReport[],
    attemptCounts: Record<BlastAttemptStatus, number>,
  ) {
    const totals = reports.reduce(
      (acc, report) => ({
        totalViews: acc.totalViews + report.views,
        totalLikes: acc.totalLikes + report.likes,
        totalComments: acc.totalComments + report.comments,
        totalShares: acc.totalShares + report.shares,
        totalReposts: acc.totalReposts + report.reposts,
      }),
      {
        totalViews: 0,
        totalLikes: 0,
        totalComments: 0,
        totalShares: 0,
        totalReposts: 0,
      },
    );

    return {
      ...totals,
      totalEngagement:
        totals.totalLikes +
        totals.totalComments +
        totals.totalShares +
        totals.totalReposts,
      completionRate: attemptCounts[BlastAttemptStatus.COMPLETED],
    };
  }

  private buildPlatformBreakdown(reports: DashboardReport[]) {
    const byPlatform = new Map<
      Platform,
      {
        platform: Platform;
        views: number;
        likes: number;
        comments: number;
        shares: number;
        reposts: number;
        engagement: number;
        attempts: Set<string>;
      }
    >();

    for (const report of reports) {
      const platform = report.blastAttempt.blastTarget.platform;
      const current = byPlatform.get(platform) ?? {
        platform,
        views: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        reposts: 0,
        engagement: 0,
        attempts: new Set<string>(),
      };

      current.views += report.views;
      current.likes += report.likes;
      current.comments += report.comments;
      current.shares += report.shares;
      current.reposts += report.reposts;
      current.engagement +=
        report.likes + report.comments + report.shares + report.reposts;
      current.attempts.add(report.blastAttemptId);
      byPlatform.set(platform, current);
    }

    return [...byPlatform.values()].map((item) => ({
      platform: item.platform,
      views: item.views,
      likes: item.likes,
      comments: item.comments,
      shares: item.shares,
      reposts: item.reposts,
      engagement: item.engagement,
      attempts: item.attempts.size,
    }));
  }

  private buildTopBuzzers(reports: DashboardReport[]) {
    const byBuzzer = new Map<
      string,
      {
        userId: string;
        name: string;
        completedAttemptIds: Set<string>;
        views: number;
        engagement: number;
      }
    >();

    for (const report of reports) {
      const userId = report.submittedBy.id;
      const current = byBuzzer.get(userId) ?? {
        userId,
        name: report.submittedBy.name,
        completedAttemptIds: new Set<string>(),
        views: 0,
        engagement: 0,
      };

      current.completedAttemptIds.add(report.blastAttemptId);
      current.views += report.views;
      current.engagement +=
        report.likes + report.comments + report.shares + report.reposts;
      byBuzzer.set(userId, current);
    }

    return [...byBuzzer.values()]
      .map((item) => ({
        userId: item.userId,
        name: item.name,
        completedAttempts: item.completedAttemptIds.size,
        views: item.views,
        engagement: item.engagement,
        score: item.views + item.engagement,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }

  private buildCommentMetrics(
    commandCounts: Array<{
      stance: CommentStance;
      _count?: true | { _all?: number };
    }>,
    taskCounts: Array<{
      status: CommentTaskStatus;
      _count?: true | { _all?: number };
    }>,
    overdueCommentTasks: number,
  ) {
    const taskCountByStatus = zeroCommentTaskCounts();
    for (const taskCount of taskCounts) {
      taskCountByStatus[taskCount.status] = groupCountValue(taskCount._count);
    }

    const commandCountByStance = new Map(
      commandCounts.map((item) => [item.stance, groupCountValue(item._count)]),
    );
    const proCommandCount = commandCountByStance.get(CommentStance.PRO) ?? 0;
    const kontraCommandCount =
      commandCountByStance.get(CommentStance.KONTRA) ?? 0;

    return {
      totalCommentCommands: proCommandCount + kontraCommandCount,
      totalCommentTasks: Object.values(taskCountByStatus).reduce(
        (sum, value) => sum + value,
        0,
      ),
      availableCommentTasks: taskCountByStatus[CommentTaskStatus.AVAILABLE],
      keptCommentTasks: taskCountByStatus[CommentTaskStatus.KEPT],
      pendingCommentTasks: taskCountByStatus[CommentTaskStatus.AVAILABLE],
      inProgressCommentTasks: taskCountByStatus[CommentTaskStatus.IN_PROGRESS],
      completedCommentTasks: taskCountByStatus[CommentTaskStatus.COMPLETED],
      releasedCommentTasks: taskCountByStatus[CommentTaskStatus.RELEASED],
      expiredCommentTasks: taskCountByStatus[CommentTaskStatus.EXPIRED],
      cancelledCommentTasks: taskCountByStatus[CommentTaskStatus.CANCELLED],
      rejectedCommentTasks: 0,
      blockedCommentTasks: 0,
      proCommandCount,
      kontraCommandCount,
      overdueCommentTasks,
    };
  }

  private toRecentReportResponse(report: DashboardReport) {
    const attempt = report.blastAttempt;
    const target = attempt.blastTarget;

    return {
      id: report.id,
      blastAttemptId: report.blastAttemptId,
      blastTargetId: target.id,
      postUrl: target.postUrl,
      platform: target.platform,
      socialAccount: {
        id: target.socialAccount.id,
        username: target.socialAccount.username,
        displayName: target.socialAccount.displayName,
      },
      submittedBy: report.submittedBy,
      views: report.views,
      likes: report.likes,
      comments: report.comments,
      shares: report.shares,
      reposts: report.reposts,
      totalEngagement:
        report.likes + report.comments + report.shares + report.reposts,
      proofLink: report.proofLink,
      notes: report.notes,
      submittedAt: report.submittedAt,
      attemptNo: attempt.attemptNo,
      attemptStatus: attempt.status,
    };
  }

  private async ensureDashboardAccess(user: CurrentUser, campaignId: string) {
    if (user.role === UserRole.ADMIN) {
      const campaign = await this.prisma.campaign.findFirst({
        where: {
          id: campaignId,
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
          status: true,
          startDate: true,
          endDate: true,
        },
      });

      if (!campaign) {
        throw new NotFoundException({
          code: 'NOT_FOUND',
          message: 'Campaign not found.',
          details: [],
        });
      }

      return campaign;
    }

    if (user.role !== UserRole.VIEWER) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Campaign dashboard is only available to admin and viewer.',
        details: [],
      });
    }

    const membership = await this.prisma.campaignMember.findUnique({
      where: {
        campaignId_userId: {
          campaignId,
          userId: user.id,
        },
      },
      select: {
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
      },
    });

    if (!membership || membership.campaign.deletedAt) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Campaign access denied.',
        details: [],
      });
    }

    return {
      id: membership.campaign.id,
      name: membership.campaign.name,
      status: membership.campaign.status,
      startDate: membership.campaign.startDate,
      endDate: membership.campaign.endDate,
    };
  }

  private calculateDelta(
    current: number,
    previous: number,
    unit = '%',
  ): { delta: string | null; isPositive: boolean } {
    if (current === 0 && previous === 0) {
      return { delta: null, isPositive: true };
    }
    if (previous === 0) {
      return { delta: `100${unit} (New)`, isPositive: true };
    }

    const diff = current - previous;
    const percentage = unit === 'pp' ? diff : (diff / previous) * 100;
    const rounded = Math.abs(Math.round(percentage * 10) / 10);
    const isPositive = diff >= 0;

    return {
      delta: `${rounded}${unit} vs last 7 days`,
      isPositive,
    };
  }

  async getGlobalDashboard(user: CurrentUser) {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const baseWhere: Prisma.CampaignWhereInput = { deletedAt: null };
    const userAccessWhere =
      user.role === UserRole.ADMIN
        ? {}
        : {
            members: {
              some: {
                userId: user.id,
              },
            },
          };
    const visibleCampaignsWhere = { ...baseWhere, ...userAccessWhere };

    const campaigns = await this.prisma.campaign.findMany({
      where: visibleCampaignsWhere,
      select: {
        id: true,
        status: true,
        name: true,
        blastTargets: {
          select: {
            attempts: {
              select: {
                status: true,
              },
            },
          },
        },
      },
    });
    const campaignIds = campaigns.map((c) => c.id);

    const [
      currentReports,
      previousReports,
      totalLifetimeReports,
      completedAttemptsLifetime,
      totalAttemptsLifetime,
      recentReportsList,
    ] = await this.prisma.$transaction([
      this.prisma.blastReport.findMany({
        where: {
          submittedAt: { gte: sevenDaysAgo },
          blastAttempt: {
            blastTarget: { campaignId: { in: campaignIds }, deletedAt: null },
          },
        },
        select: {
          views: true,
          likes: true,
          comments: true,
          shares: true,
          reposts: true,
        },
      }),
      this.prisma.blastReport.findMany({
        where: {
          submittedAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo },
          blastAttempt: {
            blastTarget: { campaignId: { in: campaignIds }, deletedAt: null },
          },
        },
        select: {
          views: true,
          likes: true,
          comments: true,
          shares: true,
          reposts: true,
        },
      }),
      this.prisma.blastReport.findMany({
        where: {
          blastAttempt: {
            blastTarget: { campaignId: { in: campaignIds }, deletedAt: null },
          },
        },
        select: {
          views: true,
          likes: true,
          comments: true,
          shares: true,
          reposts: true,
        },
      }),
      this.prisma.blastAttempt.count({
        where: {
          status: 'COMPLETED',
          blastTarget: { campaignId: { in: campaignIds }, deletedAt: null },
        },
      }),
      this.prisma.blastAttempt.count({
        where: {
          blastTarget: { campaignId: { in: campaignIds }, deletedAt: null },
        },
      }),
      this.prisma.blastReport.findMany({
        where: {
          blastAttempt: {
            blastTarget: { campaignId: { in: campaignIds }, deletedAt: null },
          },
        },
        orderBy: { submittedAt: 'desc' },
        take: 5,
        include: { submittedBy: { select: { name: true } } },
      }),
    ]);

    const sumMetrics = (reports: any[]) =>
      reports.reduce(
        (acc, r) => ({
          views: acc.views + r.views,
          engagement:
            acc.engagement + r.likes + r.comments + r.shares + r.reposts,
        }),
        { views: 0, engagement: 0 },
      );

    const currentMetrics = sumMetrics(currentReports);
    const previousMetrics = sumMetrics(previousReports);
    const lifetimeMetrics = sumMetrics(totalLifetimeReports);

    const activeCampaignsCount = campaigns.filter(
      (c) => c.status === 'ACTIVE',
    ).length;
    const completionRateVal =
      totalAttemptsLifetime > 0
        ? Math.round((completedAttemptsLifetime / totalAttemptsLifetime) * 100)
        : 0;

    const viewsDelta = this.calculateDelta(
      currentMetrics.views,
      previousMetrics.views,
    );
    const engagementDelta = this.calculateDelta(
      currentMetrics.engagement,
      previousMetrics.engagement,
    );

    return {
      activeCampaigns: activeCampaignsCount,
      activeCampaignsDelta: null,
      activeCampaignsDeltaPositive: true,

      totalViews: lifetimeMetrics.views,
      totalViewsDelta: viewsDelta.delta,
      totalViewsDeltaPositive: viewsDelta.isPositive,

      totalEngagement: lifetimeMetrics.engagement,
      totalEngagementDelta: engagementDelta.delta,
      totalEngagementDeltaPositive: engagementDelta.isPositive,

      completionRate: completionRateVal,
      completionRateDelta: null,
      completionRateDeltaPositive: true,

      overdueTasks: 0,
      expiredKeeps: 0,
      activeBuzzers: 0,
      engagementTrend: [],
      topBuzzers: [],
      recentActivity: recentReportsList.map((r) => ({
        id: r.id,
        type: 'blast',
        message: `${r.submittedBy?.name ?? 'Buzzer'} submitted a blast report.`,
        timestamp: r.submittedAt.toISOString(),
        actor: r.submittedBy?.name ?? 'Unknown',
      })),
      campaignPerformance: campaigns.map((c) => {
        let cTotal = 0;
        let cCompleted = 0;
        for (const target of c.blastTargets) {
          cTotal += target.attempts.length;
          for (const att of target.attempts) {
            if (att.status === 'COMPLETED') {
              cCompleted += 1;
            }
          }
        }
        const completion =
          cTotal > 0 ? Math.round((cCompleted / cTotal) * 100) : 0;
        const risk =
          completion < 50 ? 'High' : completion < 80 ? 'Medium' : 'Low';

        return {
          id: c.id,
          name: c.name,
          status: c.status,
          views: 0,
          completion,
          risk,
        };
      }),
    };
  }
}
