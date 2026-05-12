import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Readable } from 'node:stream';
import {
  AuditAction,
  ExportFormat,
  ExportScope,
  ExportStatus,
  Prisma,
  UserRole,
} from '../generated/prisma/client.js';
import { buildPaginationMeta } from '../common/dto/pagination-query.dto.js';
import { toAuditJson } from '../common/utils/audit-json.js';
import type { RequestAuditContext } from '../common/utils/request-audit-context.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { getExportProcessingTimeoutMinutes } from '../config/env.js';
import type { RossUserSession } from '../auth/auth.types.js';
import { CreateExportDto, ExportQueryDto } from './dto/index.js';
import {
  createExportFileStore,
  type ExportFileStore,
} from './stores/index.js';
import { ExportSnapshotLoader } from './generators/snapshot-loader.js';
import { renderSnapshotAsPdf } from './generators/pdf.generator.js';
import { renderSnapshotAsXlsx } from './generators/xlsx.generator.js';

type CurrentUser = RossUserSession['user'];

const EXPORT_SORT_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'completedAt',
  'failedAt',
  'format',
  'scope',
  'status',
]);

const EXPORT_INCLUDE = {
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
  requester: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  },
} satisfies Prisma.ExportReportInclude;

type ExportWithRelations = Prisma.ExportReportGetPayload<{
  include: typeof EXPORT_INCLUDE;
}>;

const EXT_FOR_FORMAT: Record<ExportFormat, string> = {
  PDF: 'pdf',
  EXCEL: 'xlsx',
};

const MIME_FOR_FORMAT: Record<ExportFormat, string> = {
  PDF: 'application/pdf',
  EXCEL: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

function exportOrderBy(
  query: ExportQueryDto,
): Prisma.ExportReportOrderByWithRelationInput {
  const sortBy = EXPORT_SORT_FIELDS.has(query.sortBy)
    ? query.sortBy
    : 'createdAt';

  return { [sortBy]: query.sortOrder };
}

function toDateRangeFilter(
  query: ExportQueryDto,
): Prisma.DateTimeFilter | undefined {
  if (!query.dateFrom && !query.dateTo) {
    return undefined;
  }

  return {
    ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
    ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
  };
}

function parseOptionalDate(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function slugify(value: string, fallback = 'campaign'): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
    .replace(/-$/g, '');
  return slug || fallback;
}

function formatTimestamp(value: Date): string {
  const pad = (input: number) => String(input).padStart(2, '0');
  return `${value.getUTCFullYear()}${pad(value.getUTCMonth() + 1)}${pad(
    value.getUTCDate(),
  )}_${pad(value.getUTCHours())}${pad(value.getUTCMinutes())}${pad(
    value.getUTCSeconds(),
  )}`;
}

function buildFileName(
  campaignName: string,
  scope: ExportScope,
  format: ExportFormat,
  generatedAt = new Date(),
): string {
  const campaignSlug = slugify(campaignName);
  const scopeSlug = scope.toLowerCase().replace(/_/g, '-');
  const formatSlug = format.toLowerCase();
  const timestamp = formatTimestamp(generatedAt);
  return `ross_${campaignSlug}_${scopeSlug}_${formatSlug}_${timestamp}.${EXT_FOR_FORMAT[format]}`;
}

function buildStorageKey(
  campaignId: string,
  fileName: string,
  generatedAt = new Date(),
): string {
  const yyyy = String(generatedAt.getUTCFullYear());
  const mm = String(generatedAt.getUTCMonth() + 1).padStart(2, '0');
  return `exports/${campaignId}/${yyyy}/${mm}/${fileName}`;
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 500);
  }
  if (typeof error === 'string') return error.slice(0, 500);
  try {
    return JSON.stringify(error).slice(0, 500);
  } catch {
    return 'Unknown generation error.';
  }
}

function isStorageNotFound(error: unknown): boolean {
  const metadata = (error as { $metadata?: { httpStatusCode?: number } })
    .$metadata;
  const name =
    error instanceof Error
      ? error.name
      : (error as { name?: string } | null)?.name;
  return (
    name === 'NotFound' ||
    name === 'NoSuchKey' ||
    metadata?.httpStatusCode === 404
  );
}

@Injectable()
export class ExportsService {
  private readonly logger = new Logger(ExportsService.name);
  private readonly fileStore: ExportFileStore;
  private readonly processingTimeoutMinutes =
    getExportProcessingTimeoutMinutes();

  constructor(
    private readonly prisma: PrismaService,
    private readonly snapshotLoader: ExportSnapshotLoader,
  ) {
    this.fileStore = createExportFileStore();
  }

  async create(
    user: CurrentUser,
    campaignId: string,
    dto: CreateExportDto,
    auditContext?: RequestAuditContext,
  ) {
    await this.ensureCampaignExists(campaignId);

    const dateFrom = parseOptionalDate(dto.dateFrom);
    const dateTo = parseOptionalDate(dto.dateTo);
    if (dateFrom && dateTo && dateFrom.getTime() > dateTo.getTime()) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'dateFrom must be less than or equal to dateTo.',
        details: [{ field: 'dateFrom', message: 'Must be <= dateTo.' }],
      });
    }

    const scope = dto.scope ?? ExportScope.FULL;
    await this.markTimedOutExports(auditContext);

    const activeDuplicate =
      typeof this.prisma.exportReport.findFirst === 'function'
        ? await this.prisma.exportReport.findFirst({
            where: {
              campaignId,
              scope,
              format: dto.format,
              status: { in: [ExportStatus.PENDING, ExportStatus.PROCESSING] },
            },
            select: { id: true },
          })
        : null;

    if (activeDuplicate) {
      throw new ConflictException({
        code: 'EXPORT_ALREADY_PROCESSING',
        message:
          'An export with the same campaign, scope, and format is already processing.',
        details: [],
      });
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const record = await tx.exportReport.create({
        data: {
          campaignId,
          format: dto.format,
          scope,
          requestedBy: user.id,
          status: ExportStatus.PENDING,
          dateFrom: dateFrom ?? undefined,
          dateTo: dateTo ?? undefined,
        },
        include: EXPORT_INCLUDE,
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          campaignId,
          action: AuditAction.EXPORT_REQUESTED,
          entityType: 'ExportReport',
          entityId: record.id,
          newValue: toAuditJson(record),
          ipAddress: auditContext?.ipAddress,
          userAgent: auditContext?.userAgent,
        },
      });

      return record;
    });

    return this.runGenerationPipeline(created, user, auditContext);
  }

  async retry(
    user: CurrentUser,
    exportId: string,
    auditContext?: RequestAuditContext,
  ) {
    await this.markTimedOutExports(auditContext);

    const source = await this.prisma.exportReport.findUnique({
      where: { id: exportId },
      include: EXPORT_INCLUDE,
    });

    if (!source || source.campaign.deletedAt) {
      throw new NotFoundException({
        code: 'EXPORT_NOT_FOUND',
        message: 'Export report not found.',
        details: [],
      });
    }

    if (
      source.status === ExportStatus.PROCESSING ||
      source.status === ExportStatus.PENDING
    ) {
      throw new ConflictException({
        code: 'EXPORT_STILL_PROCESSING',
        message: 'Export is still processing. Please wait or refresh later.',
        details: [],
      });
    }

    if (source.status !== ExportStatus.FAILED) {
      throw new ConflictException({
        code: 'EXPORT_RETRY_NOT_ALLOWED',
        message: 'Only failed exports can be retried.',
        details: [],
      });
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const record = await tx.exportReport.create({
        data: {
          campaignId: source.campaignId,
          format: source.format,
          scope: source.scope,
          requestedBy: user.id,
          status: ExportStatus.PENDING,
          dateFrom: source.dateFrom ?? undefined,
          dateTo: source.dateTo ?? undefined,
          retriedFromId: source.id,
        },
        include: EXPORT_INCLUDE,
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          campaignId: source.campaignId,
          action: AuditAction.EXPORT_REQUESTED,
          entityType: 'ExportReport',
          entityId: record.id,
          newValue: toAuditJson(record),
          ipAddress: auditContext?.ipAddress,
          userAgent: auditContext?.userAgent,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          campaignId: source.campaignId,
          action: AuditAction.EXPORT_RETRIED,
          entityType: 'ExportReport',
          entityId: record.id,
          oldValue: toAuditJson(source),
          newValue: toAuditJson(record),
          ipAddress: auditContext?.ipAddress,
          userAgent: auditContext?.userAgent,
        },
      });

      return record;
    });

    return this.runGenerationPipeline(created, user, auditContext);
  }

  async findAll(user: CurrentUser, query: ExportQueryDto) {
    await this.markTimedOutExports();
    const createdAt = toDateRangeFilter(query);
    const where: Prisma.ExportReportWhereInput = {
      ...(query.campaignId ? { campaignId: query.campaignId } : {}),
      ...(query.format ? { format: query.format } : {}),
      ...(query.scope ? { scope: query.scope } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.requestedBy ? { requestedBy: query.requestedBy } : {}),
      ...(createdAt ? { createdAt } : {}),
      campaign: {
        deletedAt: null,
        ...(user.role === UserRole.VIEWER
          ? {
              members: {
                some: {
                  userId: user.id,
                },
              },
            }
          : {}),
      },
      ...(user.role === UserRole.VIEWER
        ? { status: ExportStatus.COMPLETED }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.exportReport.findMany({
        where,
        orderBy: exportOrderBy(query),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: EXPORT_INCLUDE,
      }),
      this.prisma.exportReport.count({ where }),
    ]);

    return {
      items: items.map((item) => this.toExportResponse(item)),
      meta: buildPaginationMeta(query.page, query.limit, total),
    };
  }

  async findOne(user: CurrentUser, exportId: string) {
    await this.markTimedOutExports();
    const record = await this.loadForAccess(user, exportId);
    return this.toExportResponse(record);
  }

  /**
   * Resolve an export for downloading. Enforces RBAC, status, and storage
   * presence. Writes an `EXPORT_DOWNLOADED` audit entry on success.
   */
  async openForDownload(
    user: CurrentUser,
    exportId: string,
    auditContext?: RequestAuditContext,
  ): Promise<{
    stream: Readable;
    fileName: string;
    mimeType: string;
    fileSize: number | null;
  }> {
    await this.markTimedOutExports(auditContext);
    const record = await this.loadForAccess(user, exportId);

    if (record.status !== ExportStatus.COMPLETED) {
      throw new ConflictException({
        code: 'EXPORT_NOT_READY',
        message: 'Export is not ready for download yet.',
        details: [],
      });
    }

    if (!record.filePath) {
      await this.markExportFileMissing(record, 'Export file path is empty.');
      throw new NotFoundException({
        code: 'EXPORT_FILE_NOT_FOUND',
        message: 'Generated file path is missing on the export record.',
        details: [],
      });
    }

    try {
      const exists = await this.fileStore.exists({ key: record.filePath });
      if (!exists) {
        await this.markExportFileMissing(
          record,
          'Export file was not found in storage.',
        );
        throw new NotFoundException({
          code: 'EXPORT_FILE_NOT_FOUND',
          message: 'Export file was not found in storage.',
          details: [],
        });
      }
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Export storage exists check failed for ${record.id}: ${describeError(error)}`,
      );
      if (isStorageNotFound(error)) {
        await this.markExportFileMissing(
          record,
          'Export file was not found in storage.',
        );
        throw new NotFoundException({
          code: 'EXPORT_FILE_NOT_FOUND',
          message: 'Export file was not found in storage.',
          details: [],
        });
      }
      throw new InternalServerErrorException({
        code: 'EXPORT_STORAGE_ERROR',
        message: 'Export storage could not be reached.',
        details: [],
      });
    }

    const fileName =
      record.fileName ??
      buildFileName(record.campaign.name, record.scope, record.format);
    const mimeType = record.mimeType ?? MIME_FOR_FORMAT[record.format];
    let stat;
    let stream: Readable;
    try {
      stat = await this.fileStore.stat({ key: record.filePath });
      stream = await this.fileStore.getDownloadStream({
        key: record.filePath,
      });
    } catch (error) {
      this.logger.error(
        `Export storage download failed for ${record.id}: ${describeError(error)}`,
      );
      if (isStorageNotFound(error)) {
        await this.markExportFileMissing(
          record,
          'Export file was not found in storage.',
        );
        throw new NotFoundException({
          code: 'EXPORT_FILE_NOT_FOUND',
          message: 'Export file was not found in storage.',
          details: [],
        });
      }
      throw new InternalServerErrorException({
        code: 'EXPORT_STORAGE_ERROR',
        message: 'Export storage could not be reached.',
        details: [],
      });
    }
    const fileSize = record.fileSize ?? stat.size;

    await this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        campaignId: record.campaignId,
        action: AuditAction.EXPORT_DOWNLOADED,
        entityType: 'ExportReport',
        entityId: record.id,
        newValue: toAuditJson({
          fileName,
          fileSize,
          storageDriver: this.fileStore.driver,
        }),
        ipAddress: auditContext?.ipAddress,
        userAgent: auditContext?.userAgent,
      },
    });

    return {
      stream,
      fileName,
      mimeType,
      fileSize,
    };
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async loadForAccess(user: CurrentUser, exportId: string) {
    const record = await this.prisma.exportReport.findUnique({
      where: { id: exportId },
      include: EXPORT_INCLUDE,
    });

    if (!record || record.campaign.deletedAt) {
      throw new NotFoundException({
        code: 'EXPORT_NOT_FOUND',
        message: 'Export report not found.',
        details: [],
      });
    }

    if (user.role === UserRole.BUZZER) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Buzzer cannot access campaign exports.',
        details: [],
      });
    }

    if (user.role === UserRole.VIEWER) {
      if (record.status !== ExportStatus.COMPLETED) {
        throw new ForbiddenException({
          code: 'EXPORT_NOT_AVAILABLE',
          message: 'Viewer can only access completed exports.',
          details: [],
        });
      }

      const membership = await this.prisma.campaignMember.findUnique({
        where: {
          campaignId_userId: {
            campaignId: record.campaignId,
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

    return record;
  }

  private async runGenerationPipeline(
    initial: ExportWithRelations,
    user: CurrentUser,
    auditContext?: RequestAuditContext,
  ) {
    try {
      const generatedAt = new Date();
      await this.prisma.exportReport.update({
        where: { id: initial.id },
        data: {
          status: ExportStatus.PROCESSING,
          startedAt: new Date(),
        },
      });

      const snapshot = await this.snapshotLoader.load({
        campaignId: initial.campaignId,
        scope: initial.scope,
        format: initial.format,
        dateFrom: initial.dateFrom,
        dateTo: initial.dateTo,
        requestedBy: {
          id: initial.requester.id,
          name: initial.requester.name,
          email: initial.requester.email,
        },
      });

      await this.fileStore.ensureReady();
      const fileName = buildFileName(
        initial.campaign.name,
        initial.scope,
        initial.format,
        generatedAt,
      );
      snapshot.meta.generatedAt = generatedAt;
      snapshot.meta.exportId = initial.id;
      snapshot.meta.fileName = fileName;
      const mimeType = MIME_FOR_FORMAT[initial.format];
      const buffer =
        initial.format === ExportFormat.PDF
          ? await renderSnapshotAsPdf(snapshot)
          : await renderSnapshotAsXlsx(snapshot);

      const storageKey =
        this.fileStore.driver === 'r2'
          ? buildStorageKey(initial.campaignId, fileName, generatedAt)
          : fileName;
      const stored = await this.fileStore.writeObject({
        key: storageKey,
        body: buffer,
        contentType: mimeType,
      });
      const size = stored.size ?? buffer.length;

      const completed = await this.prisma.$transaction(async (tx) => {
        const record = await tx.exportReport.update({
          where: { id: initial.id },
          data: {
            status: ExportStatus.COMPLETED,
            fileName,
            filePath: stored.key,
            fileUrl: `/api/v1/exports/${initial.id}/download`,
            fileSize: size,
            mimeType,
            completedAt: new Date(),
            errorMessage: null,
            failedAt: null,
          },
          include: EXPORT_INCLUDE,
        });

        await tx.auditLog.create({
          data: {
            actorId: user.id,
            campaignId: record.campaignId,
            action: AuditAction.EXPORT_COMPLETED,
            entityType: 'ExportReport',
            entityId: record.id,
            oldValue: toAuditJson(initial),
            newValue: toAuditJson(record),
            ipAddress: auditContext?.ipAddress,
            userAgent: auditContext?.userAgent,
          },
        });

        return record;
      });

      return this.toExportResponse(completed);
    } catch (error) {
      const message = describeError(error);
      this.logger.error(
        `Export generation failed for ${initial.id}: ${message}`,
      );

      try {
        const failed = await this.prisma.$transaction(async (tx) => {
          const record = await tx.exportReport.update({
            where: { id: initial.id },
            data: {
              status: ExportStatus.FAILED,
              errorMessage: message,
              failedAt: new Date(),
            },
            include: EXPORT_INCLUDE,
          });

          await tx.auditLog.create({
            data: {
              actorId: user.id,
              campaignId: record.campaignId,
              action: AuditAction.EXPORT_FAILED,
              entityType: 'ExportReport',
              entityId: record.id,
              oldValue: toAuditJson(initial),
              newValue: toAuditJson(record),
              ipAddress: auditContext?.ipAddress,
              userAgent: auditContext?.userAgent,
            },
          });

          return record;
        });

        return this.toExportResponse(failed);
      } catch (persistError) {
        this.logger.error(
          `Failed to persist FAILED export state for ${initial.id}: ${describeError(persistError)}`,
        );
        throw new InternalServerErrorException({
          code: 'EXPORT_GENERATION_FAILED',
          message: 'Export generation failed and could not be recorded.',
          details: [],
        });
      }
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
        code: 'CAMPAIGN_NOT_FOUND',
        message: 'Campaign not found.',
        details: [],
      });
    }
  }

  async markTimedOutExports(auditContext?: RequestAuditContext) {
    const cutoff = new Date(
      Date.now() - this.processingTimeoutMinutes * 60 * 1000,
    );

    const timedOut =
      (await this.prisma.exportReport.findMany({
        where: {
          status: ExportStatus.PROCESSING,
          startedAt: { lt: cutoff },
        },
        include: EXPORT_INCLUDE,
      })) ?? [];

    if (!timedOut.length) return;

    for (const item of timedOut) {
      const failed = await this.prisma.exportReport.update({
        where: { id: item.id },
        data: {
          status: ExportStatus.FAILED,
          failedAt: new Date(),
          errorMessage: 'Export processing timeout. Please retry.',
        },
        include: EXPORT_INCLUDE,
      });

      await this.prisma.auditLog.create({
        data: {
          actorId: item.requestedBy,
          campaignId: item.campaignId,
          action: AuditAction.EXPORT_FAILED,
          entityType: 'ExportReport',
          entityId: item.id,
          oldValue: toAuditJson(item),
          newValue: toAuditJson(failed),
          ipAddress: auditContext?.ipAddress,
          userAgent: auditContext?.userAgent,
        },
      });
    }
  }

  private async markExportFileMissing(
    record: ExportWithRelations,
    message: string,
  ) {
    await this.prisma.exportReport.update({
      where: { id: record.id },
      data: {
        status: ExportStatus.FAILED,
        failedAt: new Date(),
        errorMessage: message,
      },
    });
  }

  private toExportResponse(exportReport: ExportWithRelations) {
    return {
      id: exportReport.id,
      campaignId: exportReport.campaignId,
      campaign: {
        id: exportReport.campaign.id,
        name: exportReport.campaign.name,
        status: exportReport.campaign.status,
        startDate: exportReport.campaign.startDate,
        endDate: exportReport.campaign.endDate,
      },
      format: exportReport.format,
      scope: exportReport.scope,
      status: exportReport.status,
      dateFrom: exportReport.dateFrom,
      dateTo: exportReport.dateTo,
      fileName: exportReport.fileName,
      fileUrl: exportReport.fileUrl,
      downloadUrl: exportReport.fileUrl,
      fileSize: exportReport.fileSize,
      mimeType: exportReport.mimeType,
      errorMessage: exportReport.errorMessage,
      retriedFromId: exportReport.retriedFromId,
      requestedBy: exportReport.requester,
      startedAt: exportReport.startedAt,
      completedAt: exportReport.completedAt,
      failedAt: exportReport.failedAt,
      createdAt: exportReport.createdAt,
      updatedAt: exportReport.updatedAt,
      // Preserved for backwards-compat with older clients that relied on the
      // legacy field name.
      generatedAt: exportReport.completedAt,
    };
  }
}
