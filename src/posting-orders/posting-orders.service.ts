import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  OrgUnitStatus,
  Platform,
  PostingOrderStatus,
  PostingSubmissionStatus,
  Prisma,
  SocialAccountStatus,
  UserRole,
} from '../generated/prisma/client.js';
import { buildPaginationMeta } from '../common/dto/pagination-query.dto.js';
import { toAuditJson } from '../common/utils/audit-json.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditLogService } from '../audit-logs/audit-log.service.js';
import type { RossUserSession } from '../auth/auth.types.js';
import { OrgUnitsService } from '../org-units/org-units.service.js';
import {
  CreatePostingOrderDto,
  PostingOrderQueryDto,
  SubmitPostingOrderDto,
  UpdatePostingOrderDto,
  UpdatePostingSubmissionStatusDto,
} from './dto/index.js';

type CurrentUser = RossUserSession['user'];

const POSTING_ORDER_SORT_FIELDS = new Set([
  'scheduledAt',
  'createdAt',
  'updatedAt',
  'status',
  'platform',
]);

function postingOrderOrderBy(
  query: PostingOrderQueryDto,
): Prisma.PostingOrderOrderByWithRelationInput {
  const sortBy = POSTING_ORDER_SORT_FIELDS.has(query.sortBy)
    ? query.sortBy
    : 'scheduledAt';
  return { [sortBy]: query.sortOrder };
}

@Injectable()
export class PostingOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogService,
    private readonly orgUnitsService: OrgUnitsService,
  ) {}

  async listCampaignOrders(
    actor: CurrentUser,
    campaignId: string,
    query: PostingOrderQueryDto,
  ) {
    this.assertAdmin(actor);
    await this.ensureCampaignExists(campaignId);

    const where: Prisma.PostingOrderWhereInput = {
      campaignId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.platform ? { platform: query.platform } : {}),
      ...(query.targetUnitId ? { targetUnitId: query.targetUnitId } : {}),
      ...(query.search
        ? {
            OR: [
              { caption: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
              { contentDriveUrl: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.postingOrder.findMany({
        where,
        orderBy: postingOrderOrderBy(query),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: this.orderInclude(),
      }),
      this.prisma.postingOrder.count({ where }),
    ]);

    return {
      items,
      meta: buildPaginationMeta(query.page, query.limit, total),
    };
  }

  async createOrder(
    actor: CurrentUser,
    campaignId: string,
    dto: CreatePostingOrderDto,
  ) {
    this.assertAdmin(actor);
    await this.ensureCampaignExists(campaignId);
    const targetUnit = await this.orgUnitsService.ensureUnitExists(dto.targetUnitId);

    if (targetUnit.status !== OrgUnitStatus.ACTIVE) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Target PIC unit must be active.',
        details: [],
      });
    }

    const created = await this.prisma.postingOrder.create({
      data: {
        campaignId,
        targetUnitId: dto.targetUnitId,
        platform: dto.platform,
        contentDriveUrl: dto.contentDriveUrl,
        scheduledAt: new Date(dto.scheduledAt),
        caption: dto.caption,
        description: dto.description,
        createdById: actor.id,
      },
      include: this.orderInclude(),
    });

    await this.auditLogs.create({
      actorId: actor.id,
      campaignId,
      action: AuditAction.POSTING_ORDER_CREATED,
      entityType: 'PostingOrder',
      entityId: created.id,
      newValue: toAuditJson(created),
    });

    return created;
  }

  async getOrder(actor: CurrentUser, id: string) {
    const order = await this.findExistingOrder(id);
    await this.assertOrderVisible(actor, order);
    return order;
  }

  async updateOrder(actor: CurrentUser, id: string, dto: UpdatePostingOrderDto) {
    this.assertAdmin(actor);
    const current = await this.findExistingOrder(id);

    if (dto.targetUnitId) {
      const targetUnit = await this.orgUnitsService.ensureUnitExists(dto.targetUnitId);
      if (targetUnit.status !== OrgUnitStatus.ACTIVE) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Target PIC unit must be active.',
          details: [],
        });
      }
    }

    const updated = await this.prisma.postingOrder.update({
      where: { id },
      data: {
        ...(dto.targetUnitId !== undefined ? { targetUnitId: dto.targetUnitId } : {}),
        ...(dto.platform !== undefined ? { platform: dto.platform } : {}),
        ...(dto.contentDriveUrl !== undefined
          ? { contentDriveUrl: dto.contentDriveUrl }
          : {}),
        ...(dto.scheduledAt !== undefined
          ? { scheduledAt: new Date(dto.scheduledAt) }
          : {}),
        ...(dto.caption !== undefined ? { caption: dto.caption } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
      include: this.orderInclude(),
    });

    await this.auditLogs.create({
      actorId: actor.id,
      campaignId: current.campaignId,
      action: AuditAction.POSTING_ORDER_UPDATED,
      entityType: 'PostingOrder',
      entityId: id,
      oldValue: toAuditJson(current),
      newValue: toAuditJson(updated),
    });

    return updated;
  }

  async getPicQueue(actor: CurrentUser, query: PostingOrderQueryDto) {
    this.assertPic(actor);
    if (!actor.picUnitId) {
      return {
        items: [],
        meta: buildPaginationMeta(query.page, query.limit, 0),
      };
    }

    const visibleUnitIds = await this.orgUnitsService.getDescendantUnitIds(
      actor.picUnitId,
    );

    const where: Prisma.PostingOrderWhereInput = {
      targetUnitId: { in: visibleUnitIds },
      ...(query.platform ? { platform: query.platform } : {}),
      ...(query.search
        ? {
            OR: [
              { caption: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
              { contentDriveUrl: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      OR: [
        { status: PostingOrderStatus.PUBLISHED_TO_QUEUE },
        { status: PostingOrderStatus.CLAIMED, claimedById: actor.id },
      ],
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.postingOrder.findMany({
        where,
        orderBy: postingOrderOrderBy(query),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: this.orderInclude(),
      }),
      this.prisma.postingOrder.count({ where }),
    ]);

    return {
      items,
      meta: buildPaginationMeta(query.page, query.limit, total),
    };
  }

  async getMySubmissions(actor: CurrentUser, query: PostingOrderQueryDto) {
    this.assertPic(actor);
    const where: Prisma.PostingSubmissionWhereInput = {
      submittedById: actor.id,
      ...(query.submissionStatus ? { status: query.submissionStatus } : {}),
      ...(query.platform ? { postingOrder: { platform: query.platform } } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.postingSubmission.findMany({
        where,
        orderBy: { submittedAt: query.sortOrder },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: this.submissionInclude(),
      }),
      this.prisma.postingSubmission.count({ where }),
    ]);

    return {
      items,
      meta: buildPaginationMeta(query.page, query.limit, total),
    };
  }

  async claimOrder(actor: CurrentUser, id: string) {
    this.assertPic(actor);
    const current = await this.findExistingOrder(id);
    await this.assertOrderVisible(actor, current);

    if (current.status !== PostingOrderStatus.PUBLISHED_TO_QUEUE) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'Posting order is not available to claim.',
        details: [],
      });
    }

    const now = new Date();
    const result = await this.prisma.postingOrder.updateMany({
      where: {
        id,
        status: PostingOrderStatus.PUBLISHED_TO_QUEUE,
        claimedById: null,
      },
      data: {
        status: PostingOrderStatus.CLAIMED,
        claimedById: actor.id,
        claimedAt: now,
      },
    });

    if (result.count === 0) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'Posting order has already been claimed by another PIC.',
        details: [],
      });
    }

    const updated = await this.findExistingOrder(id);
    await this.auditLogs.create({
      actorId: actor.id,
      campaignId: updated.campaignId,
      action: AuditAction.POSTING_ORDER_CLAIMED,
      entityType: 'PostingOrder',
      entityId: id,
      oldValue: toAuditJson(current),
      newValue: toAuditJson(updated),
    });

    return updated;
  }

  async releaseOrder(actor: CurrentUser, id: string) {
    const current = await this.findExistingOrder(id);

    if (actor.role === UserRole.PIC) {
      if (current.claimedById !== actor.id) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'PIC can only release their own claimed posting order.',
          details: [],
        });
      }
      if (current.status !== PostingOrderStatus.CLAIMED) {
        throw new ConflictException({
          code: 'CONFLICT',
          message: 'Posting order is not currently claimed.',
          details: [],
        });
      }
    } else {
      this.assertAdmin(actor);
    }

    const updated = await this.prisma.postingOrder.update({
      where: { id },
      data: {
        status: PostingOrderStatus.PUBLISHED_TO_QUEUE,
        claimedById: null,
        claimedAt: null,
      },
      include: this.orderInclude(),
    });

    await this.auditLogs.create({
      actorId: actor.id,
      campaignId: current.campaignId,
      action: AuditAction.POSTING_ORDER_RELEASED,
      entityType: 'PostingOrder',
      entityId: id,
      oldValue: toAuditJson(current),
      newValue: toAuditJson(updated),
    });

    return updated;
  }

  async submitOrder(actor: CurrentUser, id: string, dto: SubmitPostingOrderDto) {
    this.assertPic(actor);
    const order = await this.findExistingOrder(id);
    await this.assertOrderVisible(actor, order);

    if (order.status !== PostingOrderStatus.CLAIMED || order.claimedById !== actor.id) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'Only the claiming PIC can submit this posting order.',
        details: [],
      });
    }

    if (order.submission) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'Posting order already has a submission.',
        details: [],
      });
    }

    const socialAccount = await this.prisma.socialAccount.findFirst({
      where: {
        id: dto.socialAccountId,
        createdById: actor.id,
        platform: order.platform,
        status: SocialAccountStatus.ACTIVE,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!socialAccount) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'PIC social account not found, inactive, or mismatched with the posting platform.',
        details: [],
      });
    }

    const now = new Date();
    const submission = await this.prisma.$transaction(async (tx) => {
      const created = await tx.postingSubmission.create({
        data: {
          postingOrderId: id,
          submittedById: actor.id,
          socialAccountId: dto.socialAccountId,
          postedUrl: dto.postedUrl,
          proofDriveUrl: dto.proofDriveUrl,
          notes: dto.notes,
        },
        include: this.submissionInclude(),
      });

      await tx.postingOrder.update({
        where: { id },
        data: {
          status: PostingOrderStatus.COMPLETED,
          completedAt: now,
        },
      });

      return created;
    });

    await this.auditLogs.create({
      actorId: actor.id,
      campaignId: order.campaignId,
      action: AuditAction.POSTING_ORDER_SUBMITTED,
      entityType: 'PostingSubmission',
      entityId: submission.id,
      newValue: toAuditJson(submission),
    });

    return submission;
  }

  async listCampaignSubmissions(
    actor: CurrentUser,
    campaignId: string,
    query: PostingOrderQueryDto,
  ) {
    this.assertAdmin(actor);
    await this.ensureCampaignExists(campaignId);

    const eligibleForBlast = query.eligibleForBlast === 'true';
    const where: Prisma.PostingSubmissionWhereInput = {
      postingOrder: {
        campaignId,
        ...(query.platform ? { platform: query.platform } : {}),
      },
      ...(query.submissionStatus ? { status: query.submissionStatus } : {}),
      ...(eligibleForBlast
        ? {
            status: PostingSubmissionStatus.APPROVED_FOR_BLAST,
            blastTarget: null,
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.postingSubmission.findMany({
        where,
        orderBy: { submittedAt: query.sortOrder },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: this.submissionInclude(),
      }),
      this.prisma.postingSubmission.count({ where }),
    ]);

    return {
      items,
      meta: buildPaginationMeta(query.page, query.limit, total),
    };
  }

  async reviewSubmission(
    actor: CurrentUser,
    submissionId: string,
    dto: UpdatePostingSubmissionStatusDto,
  ) {
    this.assertAdmin(actor);
    const current = await this.findExistingSubmission(submissionId);

    if (
      dto.status === PostingSubmissionStatus.APPROVED_FOR_BLAST &&
      current.blastTarget
    ) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'Submission is already linked to a blast target.',
        details: [],
      });
    }

    const updated = await this.prisma.postingSubmission.update({
      where: { id: submissionId },
      data: {
        status: dto.status,
        reviewNotes: dto.reviewNotes,
        reviewedById: actor.id,
        reviewedAt: new Date(),
      },
      include: this.submissionInclude(),
    });

    await this.auditLogs.create({
      actorId: actor.id,
      campaignId: current.postingOrder.campaignId,
      action: AuditAction.POSTING_SUBMISSION_STATUS_UPDATED,
      entityType: 'PostingSubmission',
      entityId: submissionId,
      oldValue: toAuditJson(current),
      newValue: toAuditJson(updated),
    });

    return updated;
  }

  private orderInclude() {
    return {
      campaign: {
        select: { id: true, name: true, status: true },
      },
      targetUnit: {
        select: { id: true, name: true, code: true, status: true, parentId: true },
      },
      createdBy: {
        select: { id: true, name: true, email: true, role: true },
      },
      claimedBy: {
        select: { id: true, name: true, email: true, role: true },
      },
      submission: {
        include: this.submissionInclude(),
      },
    } satisfies Prisma.PostingOrderInclude;
  }

  private submissionInclude() {
    return {
      postingOrder: {
        include: {
          campaign: {
            select: { id: true, name: true, status: true },
          },
          targetUnit: {
            select: { id: true, name: true, code: true, status: true, parentId: true },
          },
        },
      },
      submittedBy: {
        select: { id: true, name: true, email: true, role: true, picUnitId: true },
      },
      reviewedBy: {
        select: { id: true, name: true, email: true, role: true },
      },
      socialAccount: {
        select: {
          id: true,
          platform: true,
          username: true,
          displayName: true,
          profileUrl: true,
          category: true,
          status: true,
          createdById: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      blastTarget: {
        select: {
          id: true,
          campaignId: true,
          postUrl: true,
          platform: true,
          status: true,
        },
      },
    } satisfies Prisma.PostingSubmissionInclude;
  }

  private async findExistingOrder(id: string) {
    const order = await this.prisma.postingOrder.findFirst({
      where: { id },
      include: this.orderInclude(),
    });

    if (!order) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Posting order not found.',
        details: [],
      });
    }

    return order;
  }

  private async findExistingSubmission(id: string) {
    const submission = await this.prisma.postingSubmission.findFirst({
      where: { id },
      include: this.submissionInclude(),
    });

    if (!submission) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Posting submission not found.',
        details: [],
      });
    }

    return submission;
  }

  private async ensureCampaignExists(campaignId: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, deletedAt: null },
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

  private async assertOrderVisible(actor: CurrentUser, order: { targetUnitId: string; claimedById: string | null; status: PostingOrderStatus }) {
    if (actor.role === UserRole.ADMIN) {
      return;
    }

    this.assertPic(actor);
    if (!actor.picUnitId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'PIC unit access has not been configured.',
        details: [],
      });
    }

    const visibleUnits = await this.orgUnitsService.getDescendantUnitIds(actor.picUnitId);
    const visible =
      visibleUnits.includes(order.targetUnitId) &&
      (order.status === PostingOrderStatus.PUBLISHED_TO_QUEUE ||
        order.claimedById === actor.id);

    if (!visible) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Posting order access denied.',
        details: [],
      });
    }
  }

  private assertAdmin(actor: CurrentUser) {
    if (actor.role !== UserRole.ADMIN) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Admin role is required.',
        details: [],
      });
    }
  }

  private assertPic(actor: CurrentUser) {
    if (actor.role !== UserRole.PIC) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'PIC role is required.',
        details: [],
      });
    }
  }
}
