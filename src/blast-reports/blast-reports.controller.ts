import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '../generated/prisma/client.js';
import { CurrentUser, Roles, RolesGuard } from '../auth/index.js';
import type { RossUserSession } from '../auth/auth.types.js';
import { successResponse } from '../common/http/api-response.js';
import { ApiEndpointDoc } from '../common/swagger/api-docs.js';
import { BlastReportsService } from './blast-reports.service.js';
import {
  CampaignBlastReportsQueryDto,
  MyBlastReportsQueryDto,
} from './dto/index.js';

@Controller('api/v1')
@UseGuards(RolesGuard)
@ApiTags('Blast Reports')
export class BlastReportsController {
  constructor(private readonly blastReportsService: BlastReportsService) {}

  @Get('campaigns/:campaignId/blast-reports')
  @Roles(UserRole.ADMIN, UserRole.VIEWER)
  @ApiEndpointDoc({
    summary: 'List campaign blast reports',
    description:
      'Admin sees all campaign reports; Viewer requires campaign access; Buzzer uses /buzzer/my-reports.',
    roles: [UserRole.ADMIN, UserRole.VIEWER],
    query: CampaignBlastReportsQueryDto,
    queryParams: [
      'page',
      'limit',
      'platform',
      'submittedBy',
      'dateFrom',
      'dateTo',
      'sortBy',
      'sortOrder',
    ],
    errors: [400, 401, 403, 404],
  })
  async getCampaignReports(
    @CurrentUser() user: RossUserSession['user'],
    @Param('campaignId') campaignId: string,
    @Query() query: CampaignBlastReportsQueryDto,
  ) {
    const result = await this.blastReportsService.getCampaignReports(
      user,
      campaignId,
      query,
    );
    return successResponse(result.items, result.meta);
  }

  @Get('blast-reports/:reportId')
  @Roles(UserRole.ADMIN, UserRole.BUZZER, UserRole.VIEWER)
  @ApiEndpointDoc({
    summary: 'Get blast report detail',
    description:
      'Admin can view all. Viewer needs campaign access. Buzzer can view only their own report.',
    roles: [UserRole.ADMIN, UserRole.BUZZER, UserRole.VIEWER],
    errors: [401, 403, 404],
  })
  getReportDetail(
    @CurrentUser() user: RossUserSession['user'],
    @Param('reportId') reportId: string,
  ) {
    return this.blastReportsService.getReportDetail(user, reportId);
  }

  @Get('buzzer/my-reports')
  @Roles(UserRole.BUZZER)
  @ApiEndpointDoc({
    summary: 'List current buzzer blast reports',
    description:
      'Buzzer-only list of reports submitted by the authenticated user.',
    roles: [UserRole.BUZZER],
    query: MyBlastReportsQueryDto,
    queryParams: ['page', 'limit', 'platform', 'sortBy', 'sortOrder'],
    errors: [400, 401, 403],
  })
  async getMyReports(
    @CurrentUser() user: RossUserSession['user'],
    @Query() query: MyBlastReportsQueryDto,
  ) {
    const result = await this.blastReportsService.getMyReports(user, query);
    return successResponse(result.items, result.meta);
  }
}
