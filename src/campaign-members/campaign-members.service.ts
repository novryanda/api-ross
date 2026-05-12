import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  CampaignMemberRole,
  Prisma,
  UserRole,
  UserStatus,
} from '../generated/prisma/client.js';
import { buildPaginationMeta } from '../common/dto/pagination-query.dto.js';
import { toAuditJson } from '../common/utils/audit-json.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditLogService } from '../audit-logs/audit-log.service.js';
import type { RossUserSession } from '../auth/auth.types.js';
import { AddCampaignMembersDto, MemberQueryDto } from './dto/index.js';

type CurrentUser = RossUserSession['user'];
type NormalizedMemberInput = {
  userId: string;
  memberRole: CampaignMemberRole;
};

const MEMBER_SORT_FIELDS = new Set(['createdAt', 'memberRole']);

function memberOrderBy(
  query: MemberQueryDto,
): Prisma.CampaignMemberOrderByWithRelationInput {
  if (
    query.sortBy === 'name' ||
    query.sortBy === 'email' ||
    query.sortBy === 'role'
  ) {
    return { user: { [query.sortBy]: query.sortOrder } };
  }

  const sortBy = MEMBER_SORT_FIELDS.has(query.sortBy)
    ? query.sortBy
    : 'createdAt';

  return { [sortBy]: query.sortOrder };
}

@Injectable()
export class CampaignMembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogService,
  ) {}

  async findAll(user: CurrentUser, campaignId: string, query: MemberQueryDto) {
    await this.ensureCampaignVisible(user, campaignId);

    const where: Prisma.CampaignMemberWhereInput = {
      campaignId,
      ...(query.memberRole ? { memberRole: query.memberRole } : {}),
      user: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.search
          ? {
              OR: [
                { name: { contains: query.search } },
                { email: { contains: query.search } },
              ],
            }
          : {}),
      },
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.campaignMember.findMany({
        where,
        orderBy: memberOrderBy(query),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              status: true,
              createdAt: true,
            },
          },
        },
      }),
      this.prisma.campaignMember.count({ where }),
    ]);

    return {
      items,
      meta: buildPaginationMeta(query.page, query.limit, total),
    };
  }

  async addMembers(
    actor: CurrentUser,
    campaignId: string,
    dto: AddCampaignMembersDto,
  ) {
    await this.ensureCampaignExists(campaignId);
    const members = this.normalizeMembers(dto);

    const targetUsers = await this.prisma.user.findMany({
      where: {
        id: {
          in: members.map((member) => member.userId),
        },
        deletedAt: null,
        status: UserStatus.ACTIVE,
      },
      select: {
        id: true,
        role: true,
      },
    });

    if (targetUsers.length !== members.length) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'One or more users were not found or inactive.',
        details: [],
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.campaignMember.createMany({
        data: members.map((member) => ({
          ...member,
          campaignId,
        })),
        skipDuplicates: true,
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: AuditAction.CAMPAIGN_MEMBER_ADDED,
          entityType: 'Campaign',
          entityId: campaignId,
          newValue: toAuditJson({ members }),
        },
      });
    });

    return this.findAll(actor, campaignId, new MemberQueryDto());
  }

  async removeMember(actor: CurrentUser, campaignId: string, userId: string) {
    await this.ensureCampaignExists(campaignId);

    const membership = await this.prisma.campaignMember.findUnique({
      where: {
        campaignId_userId: {
          campaignId,
          userId,
        },
      },
    });

    if (!membership) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Campaign member not found.',
        details: [],
      });
    }

    const deleted = await this.prisma.campaignMember.delete({
      where: {
        campaignId_userId: {
          campaignId,
          userId,
        },
      },
    });

    await this.auditLogs.create({
      actorId: actor.id,
      action: AuditAction.CAMPAIGN_MEMBER_REMOVED,
      entityType: 'CampaignMember',
      entityId: deleted.id,
      oldValue: toAuditJson(deleted),
    });

    return deleted;
  }

  private normalizeMembers(
    dto: AddCampaignMembersDto,
  ): NormalizedMemberInput[] {
    if (dto.members?.length) {
      return this.uniqueMembers(
        dto.members.map((member) => ({
          userId: member.userId,
          memberRole: member.memberRole,
        })),
      );
    }

    const memberRole = dto.memberRole ?? CampaignMemberRole.BUZZER;

    if (dto.userIds?.length) {
      return this.uniqueMembers(
        dto.userIds.map((userId) => ({
          userId,
          memberRole,
        })),
      );
    }

    if (dto.userId) {
      return [
        {
          userId: dto.userId,
          memberRole,
        },
      ];
    }

    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'At least one member must be provided.',
      details: [],
    });
  }

  private uniqueMembers(
    members: NormalizedMemberInput[],
  ): NormalizedMemberInput[] {
    const memberByUserId = new Map<string, NormalizedMemberInput>();

    for (const member of members) {
      memberByUserId.set(member.userId, member);
    }

    return [...memberByUserId.values()];
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
        code: 'NOT_FOUND',
        message: 'Campaign not found.',
        details: [],
      });
    }
  }

  private async ensureCampaignVisible(user: CurrentUser, campaignId: string) {
    await this.ensureCampaignExists(campaignId);

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
}
