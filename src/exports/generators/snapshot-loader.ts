import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  BlastAttemptStatus,
  CommentTaskStatus,
  ExportFormat,
  ExportScope,
  Prisma,
} from '../../generated/prisma/client.js';
import type {
  ExportSnapshot,
  SnapshotBlastReportRow,
  SnapshotBuzzerSummaryRow,
  SnapshotCommentTaskRow,
  SnapshotPlatformBreakdownRow,
  SnapshotRequester,
  SnapshotSummary,
} from './snapshot.js';

function buildDateFilter(
  field: string,
  from: Date | null,
  to: Date | null,
): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: from } : {}),
    ...(to ? { lte: to } : {}),
  };
}

function emptySummary(): SnapshotSummary {
  return {
    totalBlastTargets: 0,
    totalAttempts: 0,
    completedAttempts: 0,
    availableAttempts: 0,
    keptAttempts: 0,
    expiredAttempts: 0,
    totalBlastReports: 0,
    totalViews: 0,
    totalLikes: 0,
    totalComments: 0,
    totalShares: 0,
    totalReposts: 0,
    totalEngagement: 0,
    commentCommandsCount: 0,
    totalCommentTasks: 0,
    availableCommentTasks: 0,
    keptCommentTasks: 0,
    inProgressCommentTasks: 0,
    totalCompletedCommentTasks: 0,
    expiredCommentTasks: 0,
  };
}

function incrementPlatform(
  rows: Map<string, SnapshotPlatformBreakdownRow>,
  platform: SnapshotPlatformBreakdownRow['platform'],
  metrics: Omit<SnapshotPlatformBreakdownRow, 'platform' | 'blastReports'>,
) {
  const existing =
    rows.get(platform) ??
    ({
      platform,
      blastReports: 0,
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      reposts: 0,
      totalEngagement: 0,
    } satisfies SnapshotPlatformBreakdownRow);
  existing.blastReports += 1;
  existing.views += metrics.views;
  existing.likes += metrics.likes;
  existing.comments += metrics.comments;
  existing.shares += metrics.shares;
  existing.reposts += metrics.reposts;
  existing.totalEngagement += metrics.totalEngagement;
  rows.set(platform, existing);
}

function incrementBuzzer(
  rows: Map<string, SnapshotBuzzerSummaryRow>,
  user: { id: string; name: string; email: string },
  field: 'blastReports' | 'commentTasks',
  totalEngagement = 0,
) {
  const existing =
    rows.get(user.id) ??
    ({
      userId: user.id,
      name: user.name,
      email: user.email,
      blastReports: 0,
      commentTasks: 0,
      totalEngagement: 0,
    } satisfies SnapshotBuzzerSummaryRow);
  existing[field] += 1;
  existing.totalEngagement += totalEngagement;
  rows.set(user.id, existing);
}

export interface LoadSnapshotArgs {
  campaignId: string;
  scope: ExportScope;
  format: ExportFormat;
  dateFrom: Date | null;
  dateTo: Date | null;
  requestedBy: SnapshotRequester;
}

@Injectable()
export class ExportSnapshotLoader {
  constructor(private readonly prisma: PrismaService) {}

  async load(args: LoadSnapshotArgs): Promise<ExportSnapshot> {
    const [campaign, memberCount, blastPlatforms, commentPlatforms] =
      await Promise.all([
        this.prisma.campaign.findFirst({
          where: { id: args.campaignId, deletedAt: null },
          select: {
            id: true,
            name: true,
            description: true,
            status: true,
            startDate: true,
            endDate: true,
          },
        }),
        this.prisma.campaignMember.count({
          where: { campaignId: args.campaignId },
        }),
        this.prisma.blastTarget.findMany({
          where: {
            campaignId: args.campaignId,
            deletedAt: null,
            campaign: { deletedAt: null },
          },
          distinct: ['platform'],
          select: { platform: true },
        }),
        this.prisma.commentCommand.findMany({
          where: {
            campaignId: args.campaignId,
            deletedAt: null,
            campaign: { deletedAt: null },
          },
          distinct: ['platform'],
          select: { platform: true },
        }),
      ]);
    if (!campaign) {
      throw new Error(`Campaign ${args.campaignId} not found.`);
    }
    const campaignSnapshot = {
      ...campaign,
      memberCount,
      platforms: Array.from(
        new Set([
          ...blastPlatforms.map((row) => row.platform),
          ...commentPlatforms.map((row) => row.platform),
        ]),
      ),
    };

    const submittedAtFilter = buildDateFilter(
      'submittedAt',
      args.dateFrom,
      args.dateTo,
    );
    const completedAtFilter = buildDateFilter(
      'completedAt',
      args.dateFrom,
      args.dateTo,
    );

    const includeBlast =
      args.scope === ExportScope.BLAST_REPORTS ||
      args.scope === ExportScope.SUMMARY ||
      args.scope === ExportScope.FULL;
    const includeComment =
      args.scope === ExportScope.COMMENT_TASKS ||
      args.scope === ExportScope.SUMMARY ||
      args.scope === ExportScope.FULL;

    const blastRows: SnapshotBlastReportRow[] = [];
    const commentRows: SnapshotCommentTaskRow[] = [];
    const summary = emptySummary();
    const platformBreakdown = new Map<string, SnapshotPlatformBreakdownRow>();
    const topBuzzers = new Map<string, SnapshotBuzzerSummaryRow>();

    if (includeBlast) {
      const [targetCount, attemptStatusCounts] = await Promise.all([
        this.prisma.blastTarget.count({
          where: {
            campaignId: args.campaignId,
            deletedAt: null,
            campaign: { deletedAt: null },
          },
        }),
        this.prisma.blastAttempt.groupBy({
          by: ['status'],
          where: {
            blastTarget: {
              campaignId: args.campaignId,
              deletedAt: null,
              campaign: { deletedAt: null },
            },
          },
          _count: { _all: true },
        }),
      ]);
      summary.totalBlastTargets = targetCount;
      for (const row of attemptStatusCounts) {
        const count = row._count._all;
        summary.totalAttempts += count;
        if (row.status === BlastAttemptStatus.COMPLETED) {
          summary.completedAttempts = count;
        } else if (row.status === BlastAttemptStatus.AVAILABLE) {
          summary.availableAttempts = count;
        } else if (row.status === BlastAttemptStatus.KEPT) {
          summary.keptAttempts = count;
        } else if (row.status === BlastAttemptStatus.EXPIRED) {
          summary.expiredAttempts = count;
        }
      }

      const reports = await this.prisma.blastReport.findMany({
        where: {
          ...(submittedAtFilter ? { submittedAt: submittedAtFilter } : {}),
          blastAttempt: {
            blastTarget: {
              campaignId: args.campaignId,
              deletedAt: null,
              campaign: { deletedAt: null },
            },
          },
        },
        orderBy: { submittedAt: 'desc' },
        include: {
          submittedBy: { select: { id: true, name: true, email: true } },
          blastAttempt: {
            select: {
              attemptNo: true,
              status: true,
              blastTarget: {
                select: {
                  postUrl: true,
                  platform: true,
                  socialAccount: {
                    select: { username: true, displayName: true },
                  },
                },
              },
            },
          },
        },
      });

      for (const report of reports) {
        const totalEngagement =
          report.likes + report.comments + report.shares + report.reposts;
        summary.totalBlastReports += 1;
        summary.totalViews += report.views;
        summary.totalLikes += report.likes;
        summary.totalComments += report.comments;
        summary.totalShares += report.shares;
        summary.totalReposts += report.reposts;
        summary.totalEngagement += totalEngagement;
        incrementPlatform(
          platformBreakdown,
          report.blastAttempt.blastTarget.platform,
          {
            views: report.views,
            likes: report.likes,
            comments: report.comments,
            shares: report.shares,
            reposts: report.reposts,
            totalEngagement,
          },
        );
        incrementBuzzer(
          topBuzzers,
          report.submittedBy,
          'blastReports',
          totalEngagement,
        );

        if (
          args.scope === ExportScope.BLAST_REPORTS ||
          args.scope === ExportScope.FULL
        ) {
          blastRows.push({
            id: report.id,
            submittedAt: report.submittedAt,
            postUrl: report.blastAttempt.blastTarget.postUrl,
            platform: report.blastAttempt.blastTarget.platform,
            sourceAccount:
              report.blastAttempt.blastTarget.socialAccount.displayName ??
              report.blastAttempt.blastTarget.socialAccount.username ??
              null,
            attemptNo: report.blastAttempt.attemptNo,
            attemptStatus: report.blastAttempt.status,
            submittedByName: report.submittedBy.name,
            submittedByEmail: report.submittedBy.email,
            views: report.views,
            likes: report.likes,
            comments: report.comments,
            shares: report.shares,
            reposts: report.reposts,
            totalEngagement,
            proofLink: report.proofLink,
            notes: report.notes,
          });
        }
      }
    }

    if (includeComment) {
      const [commandCount, taskStatusCounts] = await Promise.all([
        this.prisma.commentCommand.count({
          where: {
            campaignId: args.campaignId,
            deletedAt: null,
            campaign: { deletedAt: null },
          },
        }),
        this.prisma.commentTask.groupBy({
          by: ['status'],
          where: {
            command: {
              campaignId: args.campaignId,
              deletedAt: null,
              campaign: { deletedAt: null },
            },
          },
          _count: { _all: true },
        }),
      ]);
      summary.commentCommandsCount = commandCount;
      for (const row of taskStatusCounts) {
        const count = row._count._all;
        summary.totalCommentTasks += count;
        if (row.status === CommentTaskStatus.AVAILABLE) {
          summary.availableCommentTasks = count;
        } else if (row.status === CommentTaskStatus.KEPT) {
          summary.keptCommentTasks = count;
        } else if (row.status === CommentTaskStatus.IN_PROGRESS) {
          summary.inProgressCommentTasks = count;
        } else if (row.status === CommentTaskStatus.COMPLETED) {
          summary.totalCompletedCommentTasks = count;
        } else if (row.status === CommentTaskStatus.EXPIRED) {
          summary.expiredCommentTasks = count;
        }
      }

      const tasks = await this.prisma.commentTask.findMany({
        where: {
          status: CommentTaskStatus.COMPLETED,
          ...(completedAtFilter ? { completedAt: completedAtFilter } : {}),
          command: {
            campaignId: args.campaignId,
            deletedAt: null,
            campaign: { deletedAt: null },
          },
        },
        orderBy: { completedAt: 'desc' },
        include: {
          keptBy: { select: { id: true, name: true, email: true } },
          command: {
            select: {
              id: true,
              platform: true,
              stance: true,
              targetPostUrl: true,
            },
          },
        },
      });

      for (const task of tasks) {
        if (task.keptBy) {
          incrementBuzzer(topBuzzers, task.keptBy, 'commentTasks');
        }
        if (
          args.scope === ExportScope.COMMENT_TASKS ||
          args.scope === ExportScope.FULL
        ) {
          commentRows.push({
            id: task.id,
            commandId: task.command.id,
            taskNo: task.taskNo,
            status: task.status,
            stance: task.command.stance,
            platform: task.command.platform,
            targetPostUrl: task.command.targetPostUrl,
            keptByName: task.keptBy?.name ?? null,
            keptByEmail: task.keptBy?.email ?? null,
            proofLink: task.proofLink,
            notes: task.notes,
            completedAt: task.completedAt,
          });
        }
      }
    }

    return {
      meta: {
        scope: args.scope,
        format: args.format,
        dateFrom: args.dateFrom,
        dateTo: args.dateTo,
        generatedAt: new Date(),
        requestedBy: args.requestedBy,
      },
      campaign: campaignSnapshot,
      summary,
      platformBreakdown: Array.from(platformBreakdown.values()).sort(
        (a, b) => b.totalEngagement - a.totalEngagement,
      ),
      topBuzzers: Array.from(topBuzzers.values()).sort(
        (a, b) => b.totalEngagement - a.totalEngagement,
      ),
      blastReports: blastRows,
      commentTasks: commentRows,
    };
  }
}
