import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  BlastAttemptStatus,
  Prisma,
  UserRole,
} from '../generated/prisma/client.js';
import { buildPaginationMeta } from '../common/dto/pagination-query.dto.js';
import { toAuditJson } from '../common/utils/audit-json.js';
import type { RequestAuditContext } from '../common/utils/request-audit-context.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { RossUserSession } from '../auth/auth.types.js';
import {
  CampaignBlastReportsQueryDto,
  MyBlastReportsQueryDto,
  SubmitBlastReportDto,
} from './dto/index.js';

type CurrentUser = RossUserSession['user'];

const REPORT_SORT_FIELDS = new Set([
  'submittedAt',
  'views',
  'likes',
  'comments',
  'shares',
  'reposts',
]);

const BLAST_REPORT_INCLUDE = {
  blastAttempt: {
    include: {
      blastTarget: {
        include: {
          campaign: true,
          socialAccount: true,
        },
      },
    },
  },
  submittedBy: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  },
} satisfies Prisma.BlastReportInclude;

type BlastReportWithRelations = Prisma.BlastReportGetPayload<{
  include: typeof BLAST_REPORT_INCLUDE;
}>;

function reportOrderBy(
  query: MyBlastReportsQueryDto | CampaignBlastReportsQueryDto,
): Prisma.BlastReportOrderByWithRelationInput {
  const sortBy = REPORT_SORT_FIELDS.has(query.sortBy)
    ? query.sortBy
    : 'submittedAt';

  return { [sortBy]: query.sortOrder };
}

function toDateRangeFilter(
  query: CampaignBlastReportsQueryDto,
): Prisma.DateTimeFilter | undefined {
  if (!query.dateFrom && !query.dateTo) {
    return undefined;
  }

  return {
    ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
    ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
  };
}

function isPrismaErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}

@Injectable()
export class BlastReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async submitReport(
    user: CurrentUser,
    attemptId: string,
    dto: SubmitBlastReportDto,
    auditContext?: RequestAuditContext,
  ) {
    const attempt = await this.findAttemptForReport(attemptId);
    await this.ensureCampaignAccess(user, attempt.blastTarget.campaignId);

    if (attempt.status !== BlastAttemptStatus.KEPT) {
      throw new ConflictException({
        code: 'ATTEMPT_INVALID_STATUS',
        message: 'Blast attempt must be kept before report submission.',
        details: [],
      });
    }

    if (attempt.keepExpiresAt && attempt.keepExpiresAt < new Date()) {
      throw new ConflictException({
        code: 'ATTEMPT_KEEP_EXPIRED',
        message: 'Blast attempt keep window has expired.',
        details: [],
      });
    }

    if (attempt.keptById !== user.id) {
      throw new ForbiddenException({
        code: 'ATTEMPT_NOT_OWNED',
        message: 'Only the buzzer who kept this attempt can submit report.',
        details: [],
      });
    }

    if (attempt.report) {
      throw new ConflictException({
        code: 'REPORT_ALREADY_SUBMITTED',
        message: 'Blast report already exists for this attempt.',
        details: [],
      });
    }

    const completedAt = new Date();

    const report = await this.prisma
      .$transaction(async (tx) => {
        const createdReport = await tx.blastReport.create({
          data: {
            blastAttemptId: attemptId,
            submittedById: user.id,
            views: dto.views,
            likes: dto.likes,
            comments: dto.comments,
            shares: dto.shares,
            reposts: dto.reposts,
            proofLink: dto.proofLink,
            notes: dto.notes,
          },
          include: this.defaultInclude(),
        });

        const updatedAttempt = await tx.blastAttempt.updateMany({
          where: {
            id: attemptId,
            status: BlastAttemptStatus.KEPT,
            keptById: user.id,
          },
          data: {
            status: BlastAttemptStatus.COMPLETED,
            completedAt,
          },
        });

        if (updatedAttempt.count === 0) {
          throw new ConflictException({
            code: 'ATTEMPT_INVALID_STATUS',
            message: 'Blast attempt can no longer be completed.',
            details: [],
          });
        }

        const completedAttempt = await tx.blastAttempt.findUniqueOrThrow({
          where: { id: attemptId },
        });

        await tx.auditLog.create({
          data: {
            actorId: user.id,
            campaignId: attempt.blastTarget.campaignId,
            action: AuditAction.BLAST_REPORT_SUBMITTED,
            entityType: 'BlastReport',
            entityId: createdReport.id,
            oldValue: toAuditJson(attempt),
            newValue: toAuditJson({
              report: createdReport,
              attempt: completedAttempt,
            }),
            ipAddress: auditContext?.ipAddress,
            userAgent: auditContext?.userAgent,
          },
        });

        return createdReport;
      })
      .catch((error: unknown) => {
        if (isPrismaErrorCode(error, 'P2002')) {
          throw new ConflictException({
            code: 'REPORT_ALREADY_SUBMITTED',
            message: 'Blast report already exists for this attempt.',
            details: [],
          });
        }

        throw error;
      });

    return report;
  }

  async getMyReports(user: CurrentUser, query: MyBlastReportsQueryDto) {
    const where: Prisma.BlastReportWhereInput = {
      submittedById: user.id,
      ...(query.platform
        ? {
            blastAttempt: {
              blastTarget: {
                platform: query.platform,
              },
            },
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.blastReport.findMany({
        where,
        orderBy: reportOrderBy(query),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: this.defaultInclude(),
      }),
      this.prisma.blastReport.count({ where }),
    ]);

    return {
      items: items.map((item) => this.toReportResponse(item)),
      meta: buildPaginationMeta(query.page, query.limit, total),
    };
  }

  async getCampaignReports(
    user: CurrentUser,
    campaignId: string,
    query: CampaignBlastReportsQueryDto,
  ) {
    await this.ensureCampaignReportAccess(user, campaignId);

    const submittedAt = toDateRangeFilter(query);
    const where: Prisma.BlastReportWhereInput = {
      ...(query.submittedBy ? { submittedById: query.submittedBy } : {}),
      ...(submittedAt ? { submittedAt } : {}),
      blastAttempt: {
        blastTarget: {
          campaignId,
          deletedAt: null,
          ...(query.platform ? { platform: query.platform } : {}),
          campaign: {
            deletedAt: null,
          },
        },
      },
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.blastReport.findMany({
        where,
        orderBy: reportOrderBy(query),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: this.defaultInclude(),
      }),
      this.prisma.blastReport.count({ where }),
    ]);

    return {
      items: items.map((item) => this.toReportResponse(item)),
      meta: buildPaginationMeta(query.page, query.limit, total),
    };
  }

  async getReportDetail(user: CurrentUser, reportId: string) {
    const report = await this.prisma.blastReport.findUnique({
      where: { id: reportId },
      include: this.defaultInclude(),
    });

    if (
      !report ||
      report.blastAttempt.blastTarget.deletedAt ||
      report.blastAttempt.blastTarget.campaign.deletedAt
    ) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Blast report not found.',
        details: [],
      });
    }

    if (user.role === UserRole.BUZZER) {
      if (report.submittedById !== user.id) {
        throw new ForbiddenException({
          code: 'REPORT_ACCESS_DENIED',
          message: 'Buzzer can only access their own blast reports.',
          details: [],
        });
      }

      return this.toReportResponse(report);
    }

    await this.ensureCampaignReportAccess(
      user,
      report.blastAttempt.blastTarget.campaignId,
    );

    return this.toReportResponse(report);
  }

  private defaultInclude() {
    return BLAST_REPORT_INCLUDE;
  }

  private toReportResponse(report: BlastReportWithRelations) {
    const attempt = report.blastAttempt;
    const target = attempt.blastTarget;

    return {
      id: report.id,
      blastAttemptId: report.blastAttemptId,
      blastTargetId: target.id,
      campaignId: target.campaignId,
      postUrl: target.postUrl,
      platform: target.platform,
      socialAccount: {
        id: target.socialAccount.id,
        platform: target.socialAccount.platform,
        username: target.socialAccount.username,
        displayName: target.socialAccount.displayName,
        profileUrl: target.socialAccount.profileUrl,
        category: target.socialAccount.category,
        status: target.socialAccount.status,
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

  private async findAttemptForReport(attemptId: string) {
    const attempt = await this.prisma.blastAttempt.findUnique({
      where: { id: attemptId },
      include: {
        report: true,
        blastTarget: {
          include: {
            campaign: true,
          },
        },
      },
    });

    if (
      !attempt ||
      attempt.blastTarget.deletedAt ||
      attempt.blastTarget.campaign.deletedAt
    ) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Blast attempt not found.',
        details: [],
      });
    }

    return attempt;
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

  private async ensureCampaignReportAccess(
    user: CurrentUser,
    campaignId: string,
  ) {
    if (user.role === UserRole.ADMIN) {
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

      return;
    }

    if (user.role !== UserRole.VIEWER) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message:
          'Campaign blast reports are only available to admin and viewer.',
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
}
