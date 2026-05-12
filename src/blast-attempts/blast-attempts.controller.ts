import {
  Body,
  Controller,
  Get,
  Param,
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
import { BlastReportsService } from '../blast-reports/blast-reports.service.js';
import { SubmitBlastReportDto } from '../blast-reports/dto/index.js';
import { BlastAttemptsService } from './blast-attempts.service.js';
import { BuzzerBlastQueueQueryDto, KeepBlastAttemptDto } from './dto/index.js';

@Controller('api/v1')
@UseGuards(RolesGuard)
@ApiTags('Blast Attempts', 'Blast Reports')
export class BlastAttemptsController {
  constructor(
    private readonly blastAttemptsService: BlastAttemptsService,
    private readonly blastReportsService: BlastReportsService,
  ) {}

  @Get('buzzer/blast-queue')
  @Roles(UserRole.BUZZER)
  @ApiEndpointDoc({
    summary: 'Get buzzer blast queue',
    description:
      'Lists AVAILABLE attempts for campaigns assigned to current Buzzer.',
    roles: [UserRole.BUZZER],
    query: BuzzerBlastQueueQueryDto,
    queryParams: ['page', 'limit', 'platform', 'sortBy', 'sortOrder'],
    errors: [400, 401, 403],
  })
  async getBlastQueue(
    @CurrentUser() user: RossUserSession['user'],
    @Query() query: BuzzerBlastQueueQueryDto,
  ) {
    const result = await this.blastAttemptsService.getBlastQueue(user, query);
    return successResponse(result.items, result.meta);
  }

  @Get('buzzer/my-kept')
  @Roles(UserRole.BUZZER)
  @ApiEndpointDoc({
    summary: 'Get current buzzer kept attempts',
    description: 'Lists KEPT attempts owned by the authenticated Buzzer.',
    roles: [UserRole.BUZZER],
    query: BuzzerBlastQueueQueryDto,
    queryParams: ['page', 'limit', 'platform', 'sortBy', 'sortOrder'],
    errors: [400, 401, 403],
  })
  async getMyKept(
    @CurrentUser() user: RossUserSession['user'],
    @Query() query: BuzzerBlastQueueQueryDto,
  ) {
    const result = await this.blastAttemptsService.getMyKept(user, query);
    return successResponse(result.items, result.meta);
  }

  @Post('blast-attempts/:attemptId/keep')
  @Roles(UserRole.BUZZER)
  @ApiEndpointDoc({
    summary: 'Keep blast attempt',
    description:
      'Atomic AVAILABLE -> KEPT claim. Race-condition safe via conditional update.',
    roles: [UserRole.BUZZER],
    body: KeepBlastAttemptDto,
    errors: [400, 401, 403, 404, 409],
  })
  keep(
    @CurrentUser() user: RossUserSession['user'],
    @Param('attemptId') attemptId: string,
    @Body() dto: KeepBlastAttemptDto,
    @Req() request: Request,
  ) {
    return this.blastAttemptsService.keep(
      user,
      attemptId,
      dto,
      getRequestAuditContext(request),
    );
  }

  @Post('blast-attempts/:attemptId/release')
  @Roles(UserRole.ADMIN, UserRole.BUZZER)
  @ApiEndpointDoc({
    summary: 'Release blast attempt',
    description:
      'Admin may release; Buzzer may release only their own KEPT attempt.',
    roles: [UserRole.ADMIN, UserRole.BUZZER],
    errors: [401, 403, 404, 409],
  })
  release(
    @CurrentUser() user: RossUserSession['user'],
    @Param('attemptId') attemptId: string,
    @Req() request: Request,
  ) {
    return this.blastAttemptsService.release(
      user,
      attemptId,
      getRequestAuditContext(request),
    );
  }

  @Post('blast-attempts/:attemptId/report')
  @Roles(UserRole.BUZZER)
  @ApiEndpointDoc({
    summary: 'Submit blast report',
    description:
      'Transactional create BlastReport, complete attempt, set completedAt, and write audit log.',
    roles: [UserRole.BUZZER],
    body: SubmitBlastReportDto,
    errors: [400, 401, 403, 404, 409],
  })
  submitReport(
    @CurrentUser() user: RossUserSession['user'],
    @Param('attemptId') attemptId: string,
    @Body() dto: SubmitBlastReportDto,
    @Req() request: Request,
  ) {
    return this.blastReportsService.submitReport(
      user,
      attemptId,
      dto,
      getRequestAuditContext(request),
    );
  }
}
