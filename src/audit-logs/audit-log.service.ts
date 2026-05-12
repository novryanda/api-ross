import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, Prisma } from '../generated/prisma/client.js';
import { buildPaginationMeta } from '../common/dto/pagination-query.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditLogQueryDto } from './dto/index.js';

export type CreateAuditLogInput = {
  actorId?: string;
  campaignId?: string;
  action: AuditAction;
  entityType: string;
  entityId?: string;
  oldValue?: Prisma.InputJsonValue;
  newValue?: Prisma.InputJsonValue;
  ipAddress?: string;
  userAgent?: string;
};

const AUDIT_LOG_SORT_FIELDS = new Set(['createdAt', 'action', 'entityType']);

const AUDIT_LOG_INCLUDE = {
  actor: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  },
  campaign: {
    select: {
      id: true,
      name: true,
      status: true,
    },
  },
} satisfies Prisma.AuditLogInclude;

type AuditLogWithRelations = Prisma.AuditLogGetPayload<{
  include: typeof AUDIT_LOG_INCLUDE;
}>;

function auditLogOrderBy(
  query: AuditLogQueryDto,
): Prisma.AuditLogOrderByWithRelationInput {
  const sortBy = AUDIT_LOG_SORT_FIELDS.has(query.sortBy)
    ? query.sortBy
    : 'createdAt';

  return { [sortBy]: query.sortOrder };
}

function toDateRangeFilter(
  query: AuditLogQueryDto,
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
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreateAuditLogInput) {
    return this.prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        campaignId: input.campaignId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        oldValue: input.oldValue,
        newValue: input.newValue,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      },
    });
  }

  async findAll(query: AuditLogQueryDto, campaignId?: string) {
    const createdAt = toDateRangeFilter(query);
    const where: Prisma.AuditLogWhereInput = {
      ...((campaignId ?? query.campaignId)
        ? { campaignId: campaignId ?? query.campaignId }
        : {}),
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(createdAt ? { createdAt } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: auditLogOrderBy(query),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: AUDIT_LOG_INCLUDE,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      items: items.map((item) => this.toAuditLogResponse(item)),
      pagination: buildPaginationMeta(query.page, query.limit, total),
    };
  }

  async findById(id: string) {
    const log = await this.prisma.auditLog.findUnique({
      where: { id },
      include: AUDIT_LOG_INCLUDE,
    });
    if (!log) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Audit log not found.',
        details: [],
      });
    }
    return this.toAuditLogResponse(log);
  }

  private toAuditLogResponse(log: AuditLogWithRelations) {
    return {
      id: log.id,
      action: log.action,
      campaignId: log.campaignId,
      campaign: log.campaign,
      actorId: log.actorId,
      actor: log.actor,
      actorName: log.actor?.name ?? null,
      actorEmail: log.actor?.email ?? null,
      actorRole: log.actor?.role ?? null,
      entityType: log.entityType,
      entityId: log.entityId,
      oldValues: log.oldValue,
      newValues: log.newValue,
      metadata: {},
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      createdAt: log.createdAt,
    };
  }
}
