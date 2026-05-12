/**
 * Snapshot types returned by `ExportSnapshotLoader`.
 *
 * The loader flattens Prisma relations into plain objects so the PDF/XLSX
 * generators can render without re-reading the database.
 */
import type {
  BlastAttemptStatus,
  CampaignStatus,
  CommentStance,
  CommentTaskStatus,
  ExportFormat,
  ExportScope,
  Platform,
} from '../../generated/prisma/client.js';

export interface SnapshotCampaign {
  id: string;
  name: string;
  description: string | null;
  status: CampaignStatus;
  startDate: Date;
  endDate: Date | null;
  memberCount: number;
  platforms: Platform[];
}

export interface SnapshotRequester {
  id: string;
  name: string;
  email: string;
}

export interface SnapshotBlastReportRow {
  id: string;
  submittedAt: Date;
  postUrl: string;
  platform: Platform;
  sourceAccount: string | null;
  attemptNo: number;
  attemptStatus: BlastAttemptStatus;
  submittedByName: string;
  submittedByEmail: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  reposts: number;
  totalEngagement: number;
  proofLink: string;
  notes: string | null;
}

export interface SnapshotCommentTaskRow {
  id: string;
  commandId: string;
  taskNo: number;
  status: CommentTaskStatus;
  stance: CommentStance;
  platform: Platform;
  targetPostUrl: string;
  keptByName: string | null;
  keptByEmail: string | null;
  proofLink: string | null;
  notes: string | null;
  completedAt: Date | null;
}

export interface SnapshotSummary {
  totalBlastTargets: number;
  totalAttempts: number;
  completedAttempts: number;
  availableAttempts: number;
  keptAttempts: number;
  expiredAttempts: number;
  totalBlastReports: number;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalReposts: number;
  totalEngagement: number;
  commentCommandsCount: number;
  totalCommentTasks: number;
  availableCommentTasks: number;
  keptCommentTasks: number;
  inProgressCommentTasks: number;
  totalCompletedCommentTasks: number;
  expiredCommentTasks: number;
}

export interface SnapshotPlatformBreakdownRow {
  platform: Platform;
  blastReports: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  reposts: number;
  totalEngagement: number;
}

export interface SnapshotBuzzerSummaryRow {
  userId: string;
  name: string;
  email: string;
  blastReports: number;
  commentTasks: number;
  totalEngagement: number;
}

export interface SnapshotMeta {
  scope: ExportScope;
  format: ExportFormat;
  dateFrom: Date | null;
  dateTo: Date | null;
  generatedAt: Date;
  requestedBy: SnapshotRequester;
  exportId?: string;
  fileName?: string | null;
  fileSize?: number | null;
}

export interface ExportSnapshot {
  meta: SnapshotMeta;
  campaign: SnapshotCampaign;
  summary: SnapshotSummary;
  platformBreakdown: SnapshotPlatformBreakdownRow[];
  topBuzzers: SnapshotBuzzerSummaryRow[];
  blastReports: SnapshotBlastReportRow[];
  commentTasks: SnapshotCommentTaskRow[];
}
