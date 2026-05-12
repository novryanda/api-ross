import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '../generated/prisma/client.js';
import { CurrentUser, Roles, RolesGuard } from '../auth/index.js';
import type { RossUserSession } from '../auth/auth.types.js';
import { successResponse } from '../common/http/api-response.js';
import { ApiEndpointDoc } from '../common/swagger/api-docs.js';
import { CampaignsService } from './campaigns.service.js';
import {
  CampaignDashboardQueryDto,
  CampaignQueryDto,
  CreateCampaignDto,
  UpdateCampaignDto,
} from './dto/index.js';

@Controller('api/v1/campaigns')
@UseGuards(RolesGuard)
@ApiTags('Campaigns', 'Dashboard')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.BUZZER, UserRole.VIEWER)
  @ApiEndpointDoc({
    summary: 'List campaigns',
    description:
      'Lists visible campaigns. Admin sees all; Buzzer/Viewer see campaign memberships.',
    roles: [UserRole.ADMIN, UserRole.BUZZER, UserRole.VIEWER],
    query: CampaignQueryDto,
    queryParams: ['page', 'limit', 'status', 'search', 'sortBy', 'sortOrder'],
  })
  async findAll(
    @CurrentUser() user: RossUserSession['user'],
    @Query() query: CampaignQueryDto,
  ) {
    const result = await this.campaignsService.findAll(user, query);
    return successResponse(result.items, result.meta);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiEndpointDoc({
    summary: 'Create campaign',
    description: 'Creates a campaign and writes CAMPAIGN_CREATED audit log.',
    roles: [UserRole.ADMIN],
    body: CreateCampaignDto,
    errors: [400, 401, 403],
  })
  create(
    @CurrentUser() user: RossUserSession['user'],
    @Body() dto: CreateCampaignDto,
  ) {
    return this.campaignsService.create(user, dto);
  }

  @Get('dashboard/global')
  @Roles(UserRole.ADMIN, UserRole.BUZZER, UserRole.VIEWER)
  @ApiEndpointDoc({
    summary: 'Get global dashboard aggregated metrics',
    description:
      'Returns real-time global dashboard data including calculated historical period deltas.',
    roles: [UserRole.ADMIN, UserRole.BUZZER, UserRole.VIEWER],
  })
  getGlobalDashboard(@CurrentUser() user: RossUserSession['user']) {
    return this.campaignsService.getGlobalDashboard(user);
  }

  @Get(':campaignId/dashboard')
  @Roles(UserRole.ADMIN, UserRole.VIEWER)
  @ApiEndpointDoc({
    summary: 'Get campaign dashboard',
    description:
      'Campaign dashboard with blast and comment metrics. Viewer access requires campaign membership.',
    roles: [UserRole.ADMIN, UserRole.VIEWER],
    query: CampaignDashboardQueryDto,
    queryParams: ['dateFrom', 'dateTo', 'platform'],
    errors: [400, 401, 403, 404],
  })
  getDashboard(
    @CurrentUser() user: RossUserSession['user'],
    @Param('campaignId') campaignId: string,
    @Query() query: CampaignDashboardQueryDto,
  ) {
    return this.campaignsService.getDashboard(user, campaignId, query);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.BUZZER, UserRole.VIEWER)
  @ApiEndpointDoc({
    summary: 'Get campaign detail',
    description: 'Returns campaign detail for users with campaign access.',
    roles: [UserRole.ADMIN, UserRole.BUZZER, UserRole.VIEWER],
    errors: [401, 403, 404],
  })
  findOne(
    @CurrentUser() user: RossUserSession['user'],
    @Param('id') id: string,
  ) {
    return this.campaignsService.findOne(user, id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiEndpointDoc({
    summary: 'Update campaign',
    description:
      'Updates campaign metadata and writes CAMPAIGN_UPDATED audit log.',
    roles: [UserRole.ADMIN],
    body: UpdateCampaignDto,
    errors: [400, 401, 403, 404],
  })
  update(
    @CurrentUser() user: RossUserSession['user'],
    @Param('id') id: string,
    @Body() dto: UpdateCampaignDto,
  ) {
    return this.campaignsService.update(user, id, dto);
  }

  @Patch(':id/archive')
  @Roles(UserRole.ADMIN)
  @ApiEndpointDoc({
    summary: 'Archive campaign',
    description: 'Archives a campaign and writes CAMPAIGN_ARCHIVED audit log.',
    roles: [UserRole.ADMIN],
    errors: [401, 403, 404],
  })
  archive(
    @CurrentUser() user: RossUserSession['user'],
    @Param('id') id: string,
  ) {
    return this.campaignsService.archive(user, id);
  }
}
