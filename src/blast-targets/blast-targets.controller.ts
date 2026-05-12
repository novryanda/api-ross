import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '../generated/prisma/client.js';
import { CurrentUser, Roles, RolesGuard } from '../auth/index.js';
import type { RossUserSession } from '../auth/auth.types.js';
import { successResponse } from '../common/http/api-response.js';
import { ApiEndpointDoc } from '../common/swagger/api-docs.js';
import { getRequestAuditContext } from '../common/utils/request-audit-context.js';
import { BlastAttemptsService } from '../blast-attempts/blast-attempts.service.js';
import { BlastAttemptQueryDto } from '../blast-attempts/dto/index.js';
import { BlastTargetsService } from './blast-targets.service.js';
import {
  BlastTargetQueryDto,
  CreateBlastTargetDto,
  UpdateBlastTargetDto,
  UpdateBlastTargetStatusDto,
} from './dto/index.js';

@Controller('api/v1/campaigns/:campaignId/blast-targets')
@UseGuards(RolesGuard)
@ApiTags('Blast Targets', 'Blast Attempts')
export class BlastTargetsController {
  constructor(
    private readonly blastTargetsService: BlastTargetsService,
    private readonly blastAttemptsService: BlastAttemptsService,
  ) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.VIEWER)
  @ApiEndpointDoc({
    summary: 'List campaign blast targets',
    description:
      'Admin and Viewer read-only listing. Buzzer should use /buzzer/blast-queue.',
    roles: [UserRole.ADMIN, UserRole.VIEWER],
    query: BlastTargetQueryDto,
    queryParams: [
      'page',
      'limit',
      'platform',
      'status',
      'reviewStatus',
      'search',
      'sortBy',
      'sortOrder',
    ],
    errors: [400, 401, 403, 404],
  })
  async findAll(
    @CurrentUser() user: RossUserSession['user'],
    @Param('campaignId') campaignId: string,
    @Query() query: BlastTargetQueryDto,
  ) {
    const result = await this.blastTargetsService.findAll(
      user,
      campaignId,
      query,
    );
    return successResponse(result.items, result.meta);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiEndpointDoc({
    summary: 'Create blast target',
    description:
      'Creates target and initial AVAILABLE BlastAttempt. Admin only.',
    roles: [UserRole.ADMIN],
    body: CreateBlastTargetDto,
    errors: [400, 401, 403, 404, 409],
  })
  create(
    @CurrentUser() user: RossUserSession['user'],
    @Param('campaignId') campaignId: string,
    @Body() dto: CreateBlastTargetDto,
  ) {
    return this.blastTargetsService.create(user, campaignId, dto);
  }

  @Get(':blastTargetId/attempts')
  @Roles(UserRole.ADMIN)
  @ApiEndpointDoc({
    summary: 'List blast attempts for target',
    description: 'Admin-only attempt history for a blast target.',
    roles: [UserRole.ADMIN],
    query: BlastAttemptQueryDto,
    queryParams: ['page', 'limit', 'status', 'sortBy', 'sortOrder'],
    errors: [400, 401, 403, 404],
  })
  async findAttempts(
    @CurrentUser() user: RossUserSession['user'],
    @Param('campaignId') campaignId: string,
    @Param('blastTargetId') blastTargetId: string,
    @Query() query: BlastAttemptQueryDto,
  ) {
    const result = await this.blastAttemptsService.findForTarget(
      user,
      campaignId,
      blastTargetId,
      query,
    );
    return successResponse(result.items, result.meta);
  }

  @Post(':blastTargetId/reblast')
  @Roles(UserRole.ADMIN)
  @ApiEndpointDoc({
    summary: 'Create reblast attempt',
    description:
      'Creates a new BlastAttempt with attemptNo = max + 1; never overwrites old attempts.',
    roles: [UserRole.ADMIN],
    errors: [401, 403, 404, 409],
  })
  reblast(
    @CurrentUser() user: RossUserSession['user'],
    @Param('campaignId') campaignId: string,
    @Param('blastTargetId') blastTargetId: string,
    @Req() request: Request,
  ) {
    return this.blastTargetsService.reblast(
      user,
      campaignId,
      blastTargetId,
      getRequestAuditContext(request),
    );
  }

  @Get(':blastTargetId')
  @Roles(UserRole.ADMIN, UserRole.VIEWER)
  @ApiEndpointDoc({
    summary: 'Get blast target detail',
    description: 'Admin and Viewer read-only target detail.',
    roles: [UserRole.ADMIN, UserRole.VIEWER],
    errors: [401, 403, 404],
  })
  findOne(
    @CurrentUser() user: RossUserSession['user'],
    @Param('campaignId') campaignId: string,
    @Param('blastTargetId') blastTargetId: string,
  ) {
    return this.blastTargetsService.findOne(user, campaignId, blastTargetId);
  }

  @Patch(':blastTargetId')
  @Roles(UserRole.ADMIN)
  @ApiEndpointDoc({
    summary: 'Update blast target',
    description: 'Updates target fields. Admin only.',
    roles: [UserRole.ADMIN],
    body: UpdateBlastTargetDto,
    errors: [400, 401, 403, 404, 409],
  })
  update(
    @CurrentUser() user: RossUserSession['user'],
    @Param('campaignId') campaignId: string,
    @Param('blastTargetId') blastTargetId: string,
    @Body() dto: UpdateBlastTargetDto,
  ) {
    return this.blastTargetsService.update(
      user,
      campaignId,
      blastTargetId,
      dto,
    );
  }

  @Patch(':blastTargetId/status')
  @Roles(UserRole.ADMIN)
  @ApiEndpointDoc({
    summary: 'Update blast target status',
    description: 'Updates ACTIVE/PAUSED/ARCHIVED status. Admin only.',
    roles: [UserRole.ADMIN],
    body: UpdateBlastTargetStatusDto,
    errors: [400, 401, 403, 404],
  })
  updateStatus(
    @CurrentUser() user: RossUserSession['user'],
    @Param('campaignId') campaignId: string,
    @Param('blastTargetId') blastTargetId: string,
    @Body() dto: UpdateBlastTargetStatusDto,
  ) {
    return this.blastTargetsService.updateStatus(
      user,
      campaignId,
      blastTargetId,
      dto,
    );
  }
}
