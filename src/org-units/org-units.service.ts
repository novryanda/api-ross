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
  OrgUnitPicAssignedFilter,
  OrgUnitViewMode,
} from './org-units.constants.js';
import {
  CreateOrgUnitDto,
  MoveOrgUnitDto,
  OrgUnitQueryDto,
  UpdateOrgUnitDto,
} from './dto/index.js';

type CurrentUser = RossUserSession['user'];

const ORG_UNIT_SORT_FIELDS = new Set(['name', 'status', 'createdAt', 'updatedAt']);

const ORG_UNIT_INCLUDE = {
  parent: {
    select: { id: true, name: true, code: true, status: true },
  },
  _count: {
    select: { children: true, members: true, postingOrders: true },
  },
} satisfies Prisma.OrgUnitInclude;

type OrgUnitListRow = Prisma.OrgUnitGetPayload<{
  include: typeof ORG_UNIT_INCLUDE;
}>;

function orgUnitOrderBy(
  query: OrgUnitQueryDto,
): Prisma.OrgUnitOrderByWithRelationInput {
  const sortBy = ORG_UNIT_SORT_FIELDS.has(query.sortBy)
    ? query.sortBy
    : 'createdAt';
  return { [sortBy]: query.sortOrder };
}

function buildLevelWhere(level: number): Prisma.OrgUnitWhereInput {
  if (level <= 1) {
    return { parentId: null };
  }

  let nested: Prisma.OrgUnitWhereInput = { parentId: null };
  for (let depth = 2; depth < level; depth += 1) {
    nested = { parent: nested };
  }

  return { parent: nested };
}

function computeUnitLevels(
  units: Array<{ id: string; parentId: string | null }>,
): Map<string, number> {
  const parentMap = new Map(units.map((unit) => [unit.id, unit.parentId]));
  const levels = new Map<string, number>();

  const resolveLevel = (unitId: string): number => {
    const cached = levels.get(unitId);
    if (cached !== undefined) {
      return cached;
    }

    const parentId = parentMap.get(unitId);
    if (!parentId) {
      levels.set(unitId, 1);
      return 1;
    }

    const level = resolveLevel(parentId) + 1;
    levels.set(unitId, level);
    return level;
  };

  for (const unit of units) {
    resolveLevel(unit.id);
  }

  return levels;
}

function serializeOrgUnitRow(
  unit: OrgUnitListRow,
  level?: number,
) {
  return {
    ...unit,
    level,
    memberCount: unit._count.members,
    childCount: unit._count.children,
    postingOrderCount: unit._count.postingOrders,
  };
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
      ...(query.level ? buildLevelWhere(query.level) : {}),
      ...(query.picAssigned === OrgUnitPicAssignedFilter.ASSIGNED
        ? { members: { some: {} } }
        : {}),
      ...(query.picAssigned === OrgUnitPicAssignedFilter.UNASSIGNED
        ? { members: { none: {} } }
        : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    if (query.view === OrgUnitViewMode.TREE) {
      const items = await this.prisma.orgUnit.findMany({
        where,
        orderBy: { name: 'asc' },
        include: ORG_UNIT_INCLUDE,
      });

      const levelMap = computeUnitLevels(items);
      const serialized = items.map((item) =>
        serializeOrgUnitRow(item, levelMap.get(item.id)),
      );

      return {
        items: this.buildOrgUnitTree(serialized),
        meta: buildPaginationMeta(1, serialized.length, serialized.length),
      };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.orgUnit.findMany({
        where,
        orderBy: orgUnitOrderBy(query),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: ORG_UNIT_INCLUDE,
      }),
      this.prisma.orgUnit.count({ where }),
    ]);

    const levelMap = computeUnitLevels(items);

    return {
      items: items.map((item) =>
        serializeOrgUnitRow(item, levelMap.get(item.id)),
      ),
      meta: buildPaginationMeta(query.page, query.limit, total),
    };
  }

  async findOne(actor: CurrentUser, id: string) {
    if (actor.role !== UserRole.ADMIN) {
      const visibleIds = actor.picUnitId
        ? await this.getDescendantUnitIds(actor.picUnitId)
        : [];
      if (!visibleIds.includes(id)) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'PIC unit access denied.',
          details: [],
        });
      }
    }

    const unit = await this.prisma.orgUnit.findFirst({
      where: { id },
      include: {
        parent: {
          select: { id: true, name: true, code: true, status: true },
        },
        members: {
          select: {
            id: true,
            name: true,
            email: true,
            status: true,
            role: true,
          },
          orderBy: { name: 'asc' },
        },
        _count: {
          select: { children: true, members: true, postingOrders: true },
        },
      },
    });

    if (!unit) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Org unit not found.',
        details: [],
      });
    }

    const ancestors = await this.getAncestorUnits(unit.parentId);
    const level = ancestors.length + 1;

    return {
      ...unit,
      level,
      ancestors,
      memberCount: unit._count.members,
      childCount: unit._count.children,
      postingOrderCount: unit._count.postingOrders,
    };
  }

  async move(actor: CurrentUser, id: string, dto: MoveOrgUnitDto) {
    return this.update(actor, id, {
      parentId: dto.parentId ?? null,
    });
  }

  async exportCsv(actor: CurrentUser, query: OrgUnitQueryDto) {
    const visibleIds =
      actor.role === UserRole.ADMIN
        ? null
        : actor.picUnitId
          ? await this.getDescendantUnitIds(actor.picUnitId)
          : [];

    if (visibleIds && visibleIds.length === 0) {
      return 'Name,Code,Level,Status,Parent,PIC Assigned,Child Units,Updated At';
    }

    const where: Prisma.OrgUnitWhereInput = {
      ...(visibleIds ? { id: { in: visibleIds } } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.level ? buildLevelWhere(query.level) : {}),
      ...(query.picAssigned === OrgUnitPicAssignedFilter.ASSIGNED
        ? { members: { some: {} } }
        : {}),
      ...(query.picAssigned === OrgUnitPicAssignedFilter.UNASSIGNED
        ? { members: { none: {} } }
        : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const items = await this.prisma.orgUnit.findMany({
      where,
      orderBy: { name: 'asc' },
      include: ORG_UNIT_INCLUDE,
    });
    const levelMap = computeUnitLevels(items);

    const header = [
      'Name',
      'Code',
      'Level',
      'Status',
      'Parent',
      'PIC Assigned',
      'Child Units',
      'Updated At',
    ];
    const lines = items.map((unit) => {
      const row = serializeOrgUnitRow(unit, levelMap.get(unit.id));
      return [
        row.name,
        row.code ?? '',
        String(row.level ?? ''),
        row.status,
        row.parent?.name ?? '',
        String(row.memberCount ?? 0),
        String(row.childCount ?? 0),
        row.updatedAt.toISOString(),
      ]
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(',');
    });

    return [header.join(','), ...lines].join('\n');
  }

  private buildOrgUnitTree(
    units: Array<ReturnType<typeof serializeOrgUnitRow>>,
  ) {
    const nodeMap = new Map<
      string,
      ReturnType<typeof serializeOrgUnitRow> & {
        children: Array<ReturnType<typeof serializeOrgUnitRow>>;
      }
    >();

    for (const unit of units) {
      nodeMap.set(unit.id, { ...unit, children: [] });
    }

    const roots: Array<
      ReturnType<typeof serializeOrgUnitRow> & {
        children: Array<ReturnType<typeof serializeOrgUnitRow>>;
      }
    > = [];

    for (const unit of units) {
      const node = nodeMap.get(unit.id);
      if (!node) continue;

      if (unit.parentId && nodeMap.has(unit.parentId)) {
        nodeMap.get(unit.parentId)?.children.push(node);
        continue;
      }

      roots.push(node);
    }

    const sortNodes = (
      nodes: Array<
        ReturnType<typeof serializeOrgUnitRow> & {
          children: Array<ReturnType<typeof serializeOrgUnitRow>>;
        }
      >,
    ) => {
      nodes.sort((left, right) => left.name.localeCompare(right.name));
      for (const node of nodes) {
        sortNodes(
          node.children as Array<
            ReturnType<typeof serializeOrgUnitRow> & {
              children: Array<ReturnType<typeof serializeOrgUnitRow>>;
            }
          >,
        );
      }
    };

    sortNodes(roots);
    return roots;
  }

  private async getAncestorUnits(parentId: string | null) {
    const ancestors: Array<{
      id: string;
      name: string;
      code: string | null;
    }> = [];
    let currentParentId = parentId;

    while (currentParentId) {
      const parent = await this.prisma.orgUnit.findFirst({
        where: { id: currentParentId },
        select: {
          id: true,
          name: true,
          code: true,
          parentId: true,
        },
      });

      if (!parent) break;

      ancestors.unshift(parent);
      currentParentId = parent.parentId;
    }

    return ancestors;
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

  async remove(_actor: CurrentUser, id: string) {
    const current = await this.findExistingUnit(id);

    const [childCount, memberCount, postingOrderCount] = await this.prisma.$transaction([
      this.prisma.orgUnit.count({ where: { parentId: id } }),
      this.prisma.user.count({ where: { picUnitId: id } }),
      this.prisma.postingOrder.count({ where: { targetUnitId: id } }),
    ]);

    if (childCount > 0) {
      throw new BadRequestException({
        code: 'ORG_UNIT_HAS_CHILDREN',
        message:
          'Unit ini masih memiliki sub unit. Hapus atau pindahkan sub unit terlebih dahulu.',
        details: [
          {
            field: 'childCount',
            message:
              'Unit ini masih memiliki sub unit. Hapus atau pindahkan sub unit terlebih dahulu.',
          },
        ],
      });
    }

    if (memberCount > 0) {
      throw new BadRequestException({
        code: 'ORG_UNIT_HAS_PIC_USERS',
        message:
          'Unit ini masih dipakai oleh user PIC. Pindahkan user PIC terlebih dahulu.',
        details: [
          {
            field: 'memberCount',
            message:
              'Unit ini masih dipakai oleh user PIC. Pindahkan user PIC terlebih dahulu.',
          },
        ],
      });
    }

    if (postingOrderCount > 0) {
      throw new BadRequestException({
        code: 'ORG_UNIT_HAS_POSTING_ORDERS',
        message:
          'Unit ini masih dipakai oleh posting order. Selesaikan atau pindahkan posting order terlebih dahulu.',
        details: [
          {
            field: 'postingOrderCount',
            message:
              'Unit ini masih dipakai oleh posting order. Selesaikan atau pindahkan posting order terlebih dahulu.',
          },
        ],
      });
    }

    return this.prisma.orgUnit.delete({
      where: { id },
      include: {
        parent: {
          select: { id: true, name: true, code: true, status: true },
        },
      },
    });
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
