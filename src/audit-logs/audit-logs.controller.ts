import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles, RolesGuard } from '../auth/index.js';
import { successResponse } from '../common/http/api-response.js';
import { ApiEndpointDoc } from '../common/swagger/api-docs.js';
import { UserRole } from '../generated/prisma/client.js';
import { AuditLogService } from './audit-log.service.js';
import { AuditLogQueryDto } from './dto/index.js';

@Controller('api/v1')
@UseGuards(RolesGuard)
@ApiTags('Audit Logs')
export class AuditLogsController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get('audit-logs')
  @Roles(UserRole.ADMIN)
  @ApiEndpointDoc({
    summary: 'List audit logs',
    description:
      'Admin-only. Envelope: `data: { items, pagination }`. Supports filters by action/entity/actor/campaign/date range.',
    roles: [UserRole.ADMIN],
    query: AuditLogQueryDto,
    queryParams: [
      'page',
      'limit',
      'campaignId',
      'actorId',
      'entityType',
      'entityId',
      'action',
      'dateFrom',
      'dateTo',
      'sortBy',
      'sortOrder',
    ],
    errors: [400, 401, 403],
  })
  async findAll(@Query() query: AuditLogQueryDto) {
    const result = await this.auditLogService.findAll(query);
    return successResponse(result);
  }

  @Get('audit-logs/:auditLogId')
  @Roles(UserRole.ADMIN)
  @ApiEndpointDoc({
    summary: 'Get audit log detail',
    description:
      'Admin-only. Returns actor, campaign, entity metadata, old/new values, and request context.',
    roles: [UserRole.ADMIN],
    errors: [401, 403, 404],
  })
  async findById(@Param('auditLogId') auditLogId: string) {
    const log = await this.auditLogService.findById(auditLogId);
    return successResponse(log);
  }

  @Get('campaigns/:campaignId/audit-logs')
  @Roles(UserRole.ADMIN)
  @ApiEndpointDoc({
    summary: 'List campaign audit logs',
    description:
      'Admin-only audit log list scoped to a campaign. Same envelope as /audit-logs.',
    roles: [UserRole.ADMIN],
    query: AuditLogQueryDto,
    queryParams: [
      'page',
      'limit',
      'actorId',
      'entityType',
      'entityId',
      'action',
      'dateFrom',
      'dateTo',
      'sortBy',
      'sortOrder',
    ],
    errors: [400, 401, 403],
  })
  async findByCampaign(
    @Param('campaignId') campaignId: string,
    @Query() query: AuditLogQueryDto,
  ) {
    const result = await this.auditLogService.findAll(query, campaignId);
    return successResponse(result);
  }
}
