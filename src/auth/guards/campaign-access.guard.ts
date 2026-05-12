import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../generated/prisma/client.js';
import { PrismaService } from '../../common/prisma.service.js';
import type { RossUserSession } from '../auth.types.js';
import {
  CAMPAIGN_ACCESS_KEY,
  CampaignAccessOptions,
} from '../decorators/campaign-access.decorator.js';

type RequestWithCampaign = {
  session?: RossUserSession;
  params?: Record<string, string | undefined>;
  body?: { campaignId?: string };
  query?: { campaignId?: string };
};

@Injectable()
export class CampaignAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<CampaignAccessOptions>(
      CAMPAIGN_ACCESS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithCampaign>();
    const session = request.session;

    if (!session) {
      throw new UnauthorizedException('Authentication is required.');
    }

    const allowedRoles = options.roles ?? [
      UserRole.ADMIN,
      UserRole.BUZZER,
      UserRole.VIEWER,
    ];

    if (!allowedRoles.includes(session.user.role)) {
      throw new ForbiddenException('Insufficient campaign permission.');
    }

    const campaignId =
      request.params?.[options.campaignIdParam ?? 'campaignId'] ??
      request.body?.campaignId ??
      request.query?.campaignId;

    if (!campaignId) {
      throw new NotFoundException('Campaign id is required.');
    }

    if (session.user.role === UserRole.ADMIN) {
      const campaign = await this.prisma.campaign.findFirst({
        where: {
          id: campaignId,
          deletedAt: null,
        },
        select: { id: true },
      });

      if (campaign) {
        return true;
      }
    }

    const membership = await this.prisma.campaignMember.findUnique({
      where: {
        campaignId_userId: {
          campaignId,
          userId: session.user.id,
        },
      },
      select: {
        memberRole: true,
        campaign: {
          select: {
            deletedAt: true,
          },
        },
      },
    });

    if (!membership || membership.campaign.deletedAt) {
      throw new ForbiddenException('Campaign access denied.');
    }

    if (!allowedRoles.includes(membership.memberRole)) {
      throw new ForbiddenException('Insufficient campaign access role.');
    }

    return true;
  }
}
