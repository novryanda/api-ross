import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  Prisma,
  SocialAccountStatus,
} from '../generated/prisma/client.js';
import { buildPaginationMeta } from '../common/dto/pagination-query.dto.js';
import { toAuditJson } from '../common/utils/audit-json.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditLogService } from '../audit-logs/audit-log.service.js';
import type { RossUserSession } from '../auth/auth.types.js';
import {
  CreateSocialAccountDto,
  SocialAccountQueryDto,
  UpdateSocialAccountDto,
  UpdateSocialAccountStatusDto,
} from './dto/index.js';

type CurrentUser = RossUserSession['user'];

const SOCIAL_ACCOUNT_SORT_FIELDS = new Set([
  'username',
  'displayName',
  'platform',
  'category',
  'status',
  'createdAt',
  'updatedAt',
]);

function socialAccountOrderBy(
  query: SocialAccountQueryDto,
): Prisma.SocialAccountOrderByWithRelationInput {
  const sortBy = SOCIAL_ACCOUNT_SORT_FIELDS.has(query.sortBy)
    ? query.sortBy
    : 'createdAt';

  return { [sortBy]: query.sortOrder };
}

@Injectable()
export class SocialAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogService,
  ) {}

  async findAll(query: SocialAccountQueryDto) {
    const where: Prisma.SocialAccountWhereInput = {
      deletedAt: null,
      ...(query.platform ? { platform: query.platform } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { username: { contains: query.search } },
              { displayName: { contains: query.search } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.socialAccount.findMany({
        where,
        orderBy: socialAccountOrderBy(query),
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
              blastTargets: true,
              commentCommands: true,
            },
          },
        },
      }),
      this.prisma.socialAccount.count({ where }),
    ]);

    return {
      items,
      meta: buildPaginationMeta(query.page, query.limit, total),
    };
  }

  async create(actor: CurrentUser, dto: CreateSocialAccountDto) {
    await this.ensureUniquePlatformUsername(dto.platform, dto.username);

    const socialAccount = await this.prisma.socialAccount.create({
      data: {
        platform: dto.platform,
        username: dto.username,
        displayName: dto.displayName,
        profileUrl: dto.profileUrl,
        category: dto.category,
        status: dto.status ?? SocialAccountStatus.ACTIVE,
        createdById: actor.id,
      },
    });

    await this.auditLogs.create({
      actorId: actor.id,
      action: AuditAction.SOCIAL_ACCOUNT_CREATED,
      entityType: 'SocialAccount',
      entityId: socialAccount.id,
      newValue: toAuditJson(socialAccount),
    });

    return socialAccount;
  }

  async findOne(id: string) {
    const socialAccount = await this.prisma.socialAccount.findFirst({
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
        _count: {
          select: {
            blastTargets: true,
            commentCommands: true,
          },
        },
      },
    });

    if (!socialAccount) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Social account not found.',
        details: [],
      });
    }

    return socialAccount;
  }

  async update(actor: CurrentUser, id: string, dto: UpdateSocialAccountDto) {
    const current = await this.findExistingSocialAccount(id);
    const nextPlatform = dto.platform ?? current.platform;
    const nextUsername = dto.username ?? current.username;

    if (
      nextPlatform !== current.platform ||
      nextUsername !== current.username
    ) {
      await this.ensureUniquePlatformUsername(nextPlatform, nextUsername, id);
    }

    const updated = await this.prisma.socialAccount.update({
      where: { id },
      data: {
        ...(dto.platform !== undefined ? { platform: dto.platform } : {}),
        ...(dto.username !== undefined ? { username: dto.username } : {}),
        ...(dto.displayName !== undefined
          ? { displayName: dto.displayName }
          : {}),
        ...(dto.profileUrl !== undefined ? { profileUrl: dto.profileUrl } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
      },
    });

    await this.auditLogs.create({
      actorId: actor.id,
      action: AuditAction.SOCIAL_ACCOUNT_UPDATED,
      entityType: 'SocialAccount',
      entityId: updated.id,
      oldValue: toAuditJson(current),
      newValue: toAuditJson(updated),
    });

    return updated;
  }

  async updateStatus(
    actor: CurrentUser,
    id: string,
    dto: UpdateSocialAccountStatusDto,
  ) {
    const current = await this.findExistingSocialAccount(id);

    const updated = await this.prisma.socialAccount.update({
      where: { id },
      data: {
        status: dto.status,
      },
    });

    await this.auditLogs.create({
      actorId: actor.id,
      action: AuditAction.SOCIAL_ACCOUNT_STATUS_UPDATED,
      entityType: 'SocialAccount',
      entityId: updated.id,
      oldValue: toAuditJson(current),
      newValue: toAuditJson(updated),
    });

    return updated;
  }

  private async findExistingSocialAccount(id: string) {
    const socialAccount = await this.prisma.socialAccount.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!socialAccount) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Social account not found.',
        details: [],
      });
    }

    return socialAccount;
  }

  private async ensureUniquePlatformUsername(
    platform: CreateSocialAccountDto['platform'],
    username: string,
    ignoredId?: string,
  ) {
    const existing = await this.prisma.socialAccount.findUnique({
      where: {
        platform_username: {
          platform,
          username,
        },
      },
      select: {
        id: true,
      },
    });

    if (existing && existing.id !== ignoredId) {
      throw new ConflictException({
        code: 'DUPLICATE_RESOURCE',
        message:
          'Social account with this platform and username already exists.',
        details: [],
      });
    }
  }
}
