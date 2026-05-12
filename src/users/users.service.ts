import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { hashPassword as betterAuthHashPassword } from 'better-auth/crypto';
import {
  AuditAction,
  BlastAttemptStatus,
  CampaignMemberRole,
  CommentTaskStatus,
  Prisma,
  UserRole,
  UserStatus,
} from '../generated/prisma/client.js';
import {
  PaginationMeta,
  buildPaginationMeta,
} from '../common/dto/pagination-query.dto.js';
import { toAuditJson } from '../common/utils/audit-json.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditLogService } from '../audit-logs/audit-log.service.js';
import type { RossUserSession } from '../auth/auth.types.js';
import {
  AdminResetPasswordDto,
  CreateUserDto,
  ListUsersQueryDto,
  UpdateUserDto,
  UpdateUserStatusDto,
} from './dto/index.js';

type CurrentUser = RossUserSession['user'];

const USER_SORT_FIELDS = new Set([
  'name',
  'email',
  'role',
  'status',
  'createdAt',
  'updatedAt',
  'lastLoginAt',
]);

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  image: true,
  role: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

function userOrderBy(
  query: ListUsersQueryDto,
): Prisma.UserOrderByWithRelationInput {
  const sortBy = USER_SORT_FIELDS.has(query.sortBy)
    ? query.sortBy
    : 'createdAt';
  return { [sortBy]: query.sortOrder };
}

function campaignMemberRoleForUserRole(role: UserRole): CampaignMemberRole {
  switch (role) {
    case UserRole.ADMIN:
      return CampaignMemberRole.ADMIN;
    case UserRole.VIEWER:
      return CampaignMemberRole.VIEWER;
    case UserRole.BUZZER:
    default:
      return CampaignMemberRole.BUZZER;
  }
}

export type ListUsersResult = {
  items: Array<
    Prisma.UserGetPayload<{ select: typeof USER_SELECT }> & {
      campaignCount: number;
    }
  >;
  meta: PaginationMeta;
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogService,
  ) {}

  async findAll(query: ListUsersQueryDto): Promise<ListUsersResult> {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              {
                name: { contains: query.search, mode: 'insensitive' as const },
              },
              {
                email: { contains: query.search, mode: 'insensitive' as const },
              },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: userOrderBy(query),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          ...USER_SELECT,
          _count: {
            select: {
              campaignMemberships: true,
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    const items = rows.map((row) => {
      const { _count, ...rest } = row;
      return {
        ...rest,
        campaignCount: _count.campaignMemberships,
      };
    });

    return {
      items,
      meta: buildPaginationMeta(query.page, query.limit, total),
    };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: {
        ...USER_SELECT,
        campaignMemberships: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            memberRole: true,
            createdAt: true,
            campaign: {
              select: {
                id: true,
                name: true,
                status: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'User not found.',
        details: [],
      });
    }

    return user;
  }

  async create(
    actor: CurrentUser,
    dto: CreateUserDto,
    request?: { ip?: string; userAgent?: string },
  ) {
    const email = dto.email.trim().toLowerCase();
    await this.ensureEmailAvailable(email);

    if (dto.campaignIds?.length) {
      await this.ensureCampaignsExist(dto.campaignIds);
    }

    const passwordHash = dto.temporaryPassword
      ? await betterAuthHashPassword(dto.temporaryPassword)
      : null;

    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: dto.name,
          email,
          emailVerified: true,
          role: dto.role,
          status: dto.status ?? UserStatus.ACTIVE,
          banned: false,
        },
        select: USER_SELECT,
      });

      if (passwordHash) {
        await tx.account.create({
          data: {
            accountId: user.id,
            providerId: 'credential',
            userId: user.id,
            password: passwordHash,
          },
        });
      }

      if (dto.campaignIds?.length) {
        const memberRole = campaignMemberRoleForUserRole(dto.role);
        await tx.campaignMember.createMany({
          data: dto.campaignIds.map((campaignId) => ({
            campaignId,
            userId: user.id,
            memberRole,
          })),
          skipDuplicates: true,
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: AuditAction.USER_CREATED,
          entityType: 'User',
          entityId: user.id,
          newValue: toAuditJson({
            ...user,
            campaignIds: dto.campaignIds ?? [],
            hasTemporaryPassword: Boolean(passwordHash),
            requirePasswordChange: dto.requirePasswordChange ?? false,
            notes: dto.notes,
          }),
          ipAddress: request?.ip,
          userAgent: request?.userAgent,
        },
      });

      return user;
    });

    return {
      ...created,
      campaignCount: dto.campaignIds?.length ?? 0,
      // Signal to UI that the auth provider does not yet enforce
      // "require password change on next login".
      requirePasswordChange:
        dto.requirePasswordChange === true
          ? 'NEEDS_AUTH_PROVIDER_SUPPORT'
          : false,
    };
  }

  async update(
    actor: CurrentUser,
    userId: string,
    dto: UpdateUserDto,
    request?: { ip?: string; userAgent?: string },
  ) {
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'At least one field must be provided.',
        details: [],
      });
    }

    const current = await this.findExistingUser(userId);

    if (dto.email && dto.email.trim().toLowerCase() !== current.email) {
      await this.ensureEmailAvailable(dto.email.trim().toLowerCase(), userId);
    }

    if (dto.role !== undefined && dto.role !== current.role) {
      await this.guardLastAdminRoleChange(current, dto.role);
    }

    if (dto.status !== undefined && dto.status !== current.status) {
      this.guardSelfStatusChange(actor, current, dto.status);
      await this.guardLastAdminStatusChange(current, dto.status);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.user.update({
        where: { id: userId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.email !== undefined
            ? { email: dto.email.trim().toLowerCase() }
            : {}),
          ...(dto.role !== undefined ? { role: dto.role } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
        },
        select: USER_SELECT,
      });

      if (dto.status === UserStatus.INACTIVE) {
        // Force sign-out everywhere: existing sessions are rejected by the
        // session.create.before hook, but already-issued sessions stay valid
        // until expiry unless we purge them here.
        await tx.session.deleteMany({ where: { userId } });
      }

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: AuditAction.USER_UPDATED,
          entityType: 'User',
          entityId: userId,
          oldValue: toAuditJson(current),
          newValue: toAuditJson(row),
          ipAddress: request?.ip,
          userAgent: request?.userAgent,
        },
      });

      if (dto.status !== undefined && dto.status !== current.status) {
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: AuditAction.USER_STATUS_CHANGED,
            entityType: 'User',
            entityId: userId,
            oldValue: toAuditJson({ status: current.status }),
            newValue: toAuditJson({ status: row.status }),
            ipAddress: request?.ip,
            userAgent: request?.userAgent,
          },
        });
      }

      return row;
    });

    return updated;
  }

  async updateStatus(
    actor: CurrentUser,
    userId: string,
    dto: UpdateUserStatusDto,
    request?: { ip?: string; userAgent?: string },
  ) {
    const current = await this.findExistingUser(userId);

    if (dto.status === current.status) {
      return current;
    }

    this.guardSelfStatusChange(actor, current, dto.status);
    await this.guardLastAdminStatusChange(current, dto.status);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.user.update({
        where: { id: userId },
        data: { status: dto.status },
        select: USER_SELECT,
      });

      if (dto.status === UserStatus.INACTIVE) {
        await tx.session.deleteMany({ where: { userId } });
      }

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: AuditAction.USER_STATUS_CHANGED,
          entityType: 'User',
          entityId: userId,
          oldValue: toAuditJson({ status: current.status }),
          newValue: toAuditJson({ status: row.status }),
          ipAddress: request?.ip,
          userAgent: request?.userAgent,
        },
      });

      return row;
    });

    return updated;
  }

  async resetPassword(
    actor: CurrentUser,
    userId: string,
    dto: AdminResetPasswordDto,
    request?: { ip?: string; userAgent?: string },
  ) {
    const target = await this.findExistingUser(userId);
    const passwordHash = await betterAuthHashPassword(dto.newPassword);
    const revokeSessions = dto.revokeSessions ?? true;

    await this.prisma.$transaction(async (tx) => {
      await tx.account.upsert({
        where: {
          providerId_accountId: {
            providerId: 'credential',
            accountId: target.id,
          },
        },
        update: { password: passwordHash },
        create: {
          userId: target.id,
          providerId: 'credential',
          accountId: target.id,
          password: passwordHash,
        },
      });

      if (revokeSessions) {
        await tx.session.deleteMany({ where: { userId: target.id } });
      }

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: AuditAction.USER_PASSWORD_RESET_REQUESTED,
          entityType: 'User',
          entityId: target.id,
          newValue: toAuditJson({
            revokeSessions,
            requirePasswordChange: dto.requirePasswordChange ?? false,
          }),
          ipAddress: request?.ip,
          userAgent: request?.userAgent,
        },
      });
    });

    return {
      success: true,
      revokeSessions,
      requirePasswordChange:
        dto.requirePasswordChange === true
          ? 'NEEDS_AUTH_PROVIDER_SUPPORT'
          : false,
    };
  }

  async getActivitySummary(userId: string) {
    const target = await this.findExistingUser(userId);

    const [
      completedBlastAttempts,
      completedCommentTasks,
      submittedReports,
      assignedCampaigns,
      lastBlastActivity,
      lastCommentActivity,
      lastReport,
    ] = await this.prisma.$transaction([
      this.prisma.blastAttempt.count({
        where: {
          keptById: userId,
          status: BlastAttemptStatus.COMPLETED,
        },
      }),
      this.prisma.commentTask.count({
        where: {
          keptById: userId,
          status: CommentTaskStatus.COMPLETED,
        },
      }),
      this.prisma.blastReport.count({
        where: { submittedById: userId },
      }),
      this.prisma.campaignMember.count({
        where: {
          userId,
          campaign: { deletedAt: null },
        },
      }),
      this.prisma.blastAttempt.findFirst({
        where: { keptById: userId },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      }),
      this.prisma.commentTask.findFirst({
        where: { keptById: userId },
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      }),
      this.prisma.blastReport.findFirst({
        where: { submittedById: userId },
        orderBy: { submittedAt: 'desc' },
        select: { submittedAt: true },
      }),
    ]);

    const lastActivityCandidates = [
      target.lastLoginAt,
      lastBlastActivity?.updatedAt,
      lastCommentActivity?.updatedAt,
      lastReport?.submittedAt,
    ].filter((value): value is Date => Boolean(value));

    const lastActivityAt = lastActivityCandidates.length
      ? new Date(
          Math.max(...lastActivityCandidates.map((date) => date.getTime())),
        )
      : null;

    return {
      userId: target.id,
      role: target.role,
      completedBlastAttempts,
      completedCommentTasks,
      submittedReports,
      assignedCampaigns,
      lastActivityAt,
    };
  }

  private async ensureEmailAvailable(email: string, ignoreUserId?: string) {
    const existing = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, deletedAt: true },
    });

    if (existing && existing.id !== ignoreUserId) {
      throw new ConflictException({
        code: 'EMAIL_ALREADY_IN_USE',
        message: 'A user with this email already exists.',
        details: [{ field: 'email', message: 'Must be unique.' }],
      });
    }
  }

  private async ensureCampaignsExist(campaignIds: string[]) {
    const count = await this.prisma.campaign.count({
      where: {
        id: { in: campaignIds },
        deletedAt: null,
      },
    });

    if (count !== campaignIds.length) {
      throw new NotFoundException({
        code: 'CAMPAIGN_NOT_FOUND',
        message: 'One or more campaigns were not found.',
        details: [],
      });
    }
  }

  private async findExistingUser(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: USER_SELECT,
    });

    if (!user) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'User not found.',
        details: [],
      });
    }

    return user;
  }

  private guardSelfStatusChange(
    actor: CurrentUser,
    target: Prisma.UserGetPayload<{ select: typeof USER_SELECT }>,
    nextStatus: UserStatus,
  ) {
    if (
      actor.id === target.id &&
      target.status === UserStatus.ACTIVE &&
      nextStatus === UserStatus.INACTIVE
    ) {
      throw new ForbiddenException({
        code: 'CANNOT_DEACTIVATE_SELF',
        message:
          'Admins cannot deactivate themselves. Ask another admin to perform the action.',
        details: [],
      });
    }
  }

  private async guardLastAdminStatusChange(
    target: Prisma.UserGetPayload<{ select: typeof USER_SELECT }>,
    nextStatus: UserStatus,
  ) {
    if (
      target.role !== UserRole.ADMIN ||
      target.status !== UserStatus.ACTIVE ||
      nextStatus === UserStatus.ACTIVE
    ) {
      return;
    }

    const activeAdmins = await this.prisma.user.count({
      where: {
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        deletedAt: null,
        id: { not: target.id },
      },
    });

    if (activeAdmins === 0) {
      throw new ForbiddenException({
        code: 'LAST_ACTIVE_ADMIN',
        message:
          'Cannot deactivate the last active admin. Promote another user to admin first.',
        details: [],
      });
    }
  }

  private async guardLastAdminRoleChange(
    target: Prisma.UserGetPayload<{ select: typeof USER_SELECT }>,
    nextRole: UserRole,
  ) {
    if (
      target.role !== UserRole.ADMIN ||
      target.status !== UserStatus.ACTIVE ||
      nextRole === UserRole.ADMIN
    ) {
      return;
    }

    const activeAdmins = await this.prisma.user.count({
      where: {
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        deletedAt: null,
        id: { not: target.id },
      },
    });

    if (activeAdmins === 0) {
      throw new ForbiddenException({
        code: 'LAST_ACTIVE_ADMIN',
        message:
          'Cannot demote the last active admin. Promote another user to admin first.',
        details: [],
      });
    }
  }
}
