import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  OrgUnitStatus,
  Prisma,
  UserRole,
} from '../generated/prisma/client.js';
import { buildPaginationMeta } from '../common/dto/pagination-query.dto.js';
import { toAuditJson } from '../common/utils/audit-json.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditLogService } from '../audit-logs/audit-log.service.js';
import type { RossUserSession } from '../auth/auth.types.js';
import {
  CreateOrgUnitDto,
  OrgUnitQueryDto,
  UpdateOrgUnitDto,
} from './dto/index.js';

type CurrentUser = RossUserSession['user'];

const ORG_UNIT_SORT_FIELDS = new Set(['name', 'status', 'createdAt', 'updatedAt']);

function orgUnitOrderBy(
  query: OrgUnitQueryDto,
): Prisma.OrgUnitOrderByWithRelationInput {
  const sortBy = ORG_UNIT_SORT_FIELDS.has(query.sortBy)
    ? query.sortBy
    : 'createdAt';
  return { [sortBy]: query.sortOrder };
}

@Injectable()
export class OrgUnitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogService,
  ) {}

  async findAll(actor: CurrentUser, query: OrgUnitQueryDto) {
    const visibleIds =
      actor.role === UserRole.ADMIN
        ? null
        : actor.picUnitId
          ? await this.getDescendantUnitIds(actor.picUnitId)
          : [];

    if (visibleIds && visibleIds.length === 0) {
      return {
        items: [],
        meta: buildPaginationMeta(query.page, query.limit, 0),
      };
    }

    const where: Prisma.OrgUnitWhereInput = {
      ...(visibleIds ? { id: { in: visibleIds } } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.orgUnit.findMany({
        where,
        orderBy: orgUnitOrderBy(query),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          parent: {
            select: { id: true, name: true, code: true, status: true },
          },
          _count: {
            select: { children: true, members: true, postingOrders: true },
          },
        },
      }),
      this.prisma.orgUnit.count({ where }),
    ]);

    return {
      items,
      meta: buildPaginationMeta(query.page, query.limit, total),
    };
  }

  async create(actor: CurrentUser, dto: CreateOrgUnitDto) {
    if (dto.parentId) {
      await this.ensureUnitExists(dto.parentId);
    }

    const created = await this.prisma.orgUnit.create({
      data: {
        name: dto.name,
        code: dto.code,
        parentId: dto.parentId,
        status: dto.status ?? OrgUnitStatus.ACTIVE,
        createdById: actor.id,
      },
      include: {
        parent: {
          select: { id: true, name: true, code: true, status: true },
        },
      },
    });

    await this.auditLogs.create({
      actorId: actor.id,
      action: AuditAction.ORG_UNIT_CREATED,
      entityType: 'OrgUnit',
      entityId: created.id,
      newValue: toAuditJson(created),
    });

    return created;
  }

  async update(actor: CurrentUser, id: string, dto: UpdateOrgUnitDto) {
    const current = await this.findExistingUnit(id);

    if (dto.parentId) {
      if (dto.parentId === id) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Org unit cannot become its own parent.',
          details: [],
        });
      }

      const descendants = await this.getDescendantUnitIds(id);
      if (descendants.includes(dto.parentId)) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Org unit parent cannot be moved under its own descendant.',
          details: [],
        });
      }

      await this.ensureUnitExists(dto.parentId);
    }

    const updated = await this.prisma.orgUnit.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.code !== undefined ? { code: dto.code } : {}),
        ...(dto.parentId !== undefined ? { parentId: dto.parentId } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
      include: {
        parent: {
          select: { id: true, name: true, code: true, status: true },
        },
      },
    });

    await this.auditLogs.create({
      actorId: actor.id,
      action: AuditAction.ORG_UNIT_UPDATED,
      entityType: 'OrgUnit',
      entityId: id,
      oldValue: toAuditJson(current),
      newValue: toAuditJson(updated),
    });

    return updated;
  }

  async ensureUnitAccessible(actor: CurrentUser, unitId: string) {
    if (actor.role === UserRole.ADMIN) {
      return this.ensureUnitExists(unitId);
    }

    if (!actor.picUnitId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'PIC unit access has not been configured.',
        details: [],
      });
    }

    const visibleIds = await this.getDescendantUnitIds(actor.picUnitId);
    if (!visibleIds.includes(unitId)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'PIC unit access denied.',
        details: [],
      });
    }

    return this.ensureUnitExists(unitId);
  }

  async getDescendantUnitIds(rootId: string): Promise<string[]> {
    const visited = new Set<string>([rootId]);
    let frontier = [rootId];

    while (frontier.length > 0) {
      const rows = await this.prisma.orgUnit.findMany({
        where: {
          parentId: { in: frontier },
          status: OrgUnitStatus.ACTIVE,
        },
        select: { id: true },
      });

      frontier = [];
      for (const row of rows) {
        if (!visited.has(row.id)) {
          visited.add(row.id);
          frontier.push(row.id);
        }
      }
    }

    return [...visited];
  }

  async ensureUnitExists(id: string) {
    const unit = await this.prisma.orgUnit.findFirst({
      where: { id },
      select: { id: true, status: true, parentId: true, name: true, code: true },
    });

    if (!unit) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Org unit not found.',
        details: [],
      });
    }

    return unit;
  }

  private async findExistingUnit(id: string) {
    const unit = await this.prisma.orgUnit.findFirst({
      where: { id },
    });

    if (!unit) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Org unit not found.',
        details: [],
      });
    }

    return unit;
  }
}
