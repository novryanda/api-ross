/* eslint-disable prettier/prettier */
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
import { CurrentUser, Roles, RolesGuard } from '../auth/index.js';
import type { RossUserSession } from '../auth/auth.types.js';
import { successResponse } from '../common/http/api-response.js';
import { ApiEndpointDoc } from '../common/swagger/api-docs.js';
import { getRequestAuditContext } from '../common/utils/request-audit-context.js';
import { UserRole } from '../generated/prisma/client.js';
import { CommentTasksService } from './comment-tasks.service.js';
import {
  BlockCommentTaskDto,
  BuzzerCommentQueueQueryDto,
  CommentTaskQueryDto,
  CompleteCommentTaskDto,
  KeepCommentTaskDto,
  RejectCommentTaskDto,
} from './dto/index.js';

@Controller('api/v1')
@UseGuards(RolesGuard)
@ApiTags('Comment Tasks')
export class CommentTasksController {
  constructor(private readonly commentTasksService: CommentTasksService) {}

  @Get('campaigns/:campaignId/comment-tasks')
  @Roles(UserRole.ADMIN)
  @ApiEndpointDoc({
    summary: 'List campaign comment tasks',
    description:
      'Admin-only list of all comment tasks under a campaign. Supports status, command, keptBy, stance, platform, and date filters.',
    roles: [UserRole.ADMIN],
    query: CommentTaskQueryDto,
    queryParams: ['page', 'limit', 'status', 'keptBy', 'commandId', 'stance', 'platform', 'dateFrom', 'dateTo', 'sortBy', 'sortOrder'],
    errors: [400, 401, 403, 404],
  })
  async findForCampaign(
    @Param('campaignId') campaignId: string,
    @Query() query: CommentTaskQueryDto,
  ) {
    const result = await this.commentTasksService.findForCampaign(
      campaignId,
      query,
    );
    return successResponse(result.items, result.meta);
  }

  @Get('buzzer/comment-queue')
  @Roles(UserRole.BUZZER)
  @ApiEndpointDoc({
    summary: 'List available comment task queue',
    description:
      'Buzzer-only queue of AVAILABLE comment tasks from ACTIVE commands in campaigns where the Buzzer is a member.',
    roles: [UserRole.BUZZER],
    query: BuzzerCommentQueueQueryDto,
    queryParams: ['page', 'limit', 'stance', 'platform', 'sortBy', 'sortOrder'],
    errors: [400, 401, 403],
  })
  async getCommentQueue(
    @CurrentUser() user: RossUserSession['user'],
    @Query() query: BuzzerCommentQueueQueryDto,
  ) {
    const result = await this.commentTasksService.getCommentQueue(user, query);
    return successResponse(result.items, result.meta);
  }

  @Get('buzzer/comment-tasks')
  @Roles(UserRole.BUZZER)
  @ApiEndpointDoc({
    summary: 'List current buzzer comment tasks',
    description:
      'Buzzer-only list of tasks kept by the authenticated user, including KEPT, IN_PROGRESS, COMPLETED, and EXPIRED.',
    roles: [UserRole.BUZZER],
    query: CommentTaskQueryDto,
    queryParams: ['page', 'limit', 'status', 'commandId', 'stance', 'platform', 'dateFrom', 'dateTo', 'sortBy', 'sortOrder'],
    errors: [400, 401, 403],
  })
  async findForBuzzer(
    @CurrentUser() user: RossUserSession['user'],
    @Query() query: CommentTaskQueryDto,
  ) {
    const result = await this.commentTasksService.findForBuzzer(user, query);
    return successResponse(result.items, result.meta);
  }

  @Get('buzzer/comment-tasks/:taskId')
  @Roles(UserRole.BUZZER)
  @ApiEndpointDoc({
    summary: 'Get current buzzer comment task detail',
    description: 'Buzzer can view only their own task.',
    roles: [UserRole.BUZZER],
    errors: [401, 403, 404],
  })
  async findOneForBuzzer(
    @CurrentUser() user: RossUserSession['user'],
    @Param('taskId') taskId: string,
  ) {
    const task = await this.commentTasksService.findOneForBuzzer(user, taskId);
    return successResponse(task);
  }

  @Post('comment-tasks/:taskId/keep')
  @Roles(UserRole.BUZZER)
  @ApiEndpointDoc({
    summary: 'Keep comment task',
    description:
      'Atomic AVAILABLE -> KEPT claim. Race-condition safe via conditional update. Returns COMMENT_TASK_ALREADY_KEPT or COMMENT_TASK_NOT_AVAILABLE on conflict.',
    roles: [UserRole.BUZZER],
    body: KeepCommentTaskDto,
    errors: [400, 401, 403, 404, 409],
  })
  async keep(
    @CurrentUser() user: RossUserSession['user'],
    @Param('taskId') taskId: string,
    @Body() dto: KeepCommentTaskDto,
    @Req() request: Request,
  ) {
    const task = await this.commentTasksService.keep(
      user,
      taskId,
      dto,
      getRequestAuditContext(request),
    );
    return successResponse(task);
  }

  @Post('comment-tasks/:taskId/release')
  @Roles(UserRole.ADMIN, UserRole.BUZZER)
  @ApiEndpointDoc({
    summary: 'Release comment task',
    description:
      'Admin may release operationally; Buzzer may release only their own kept or in-progress task. Release reopens the task as AVAILABLE.',
    roles: [UserRole.ADMIN, UserRole.BUZZER],
    errors: [401, 403, 404, 409],
  })
  async release(
    @CurrentUser() user: RossUserSession['user'],
    @Param('taskId') taskId: string,
    @Req() request: Request,
  ) {
    const task = await this.commentTasksService.release(
      user,
      taskId,
      getRequestAuditContext(request),
    );
    return successResponse(task);
  }

  @Post('comment-tasks/:taskId/start')
  @Roles(UserRole.BUZZER)
  @ApiEndpointDoc({
    summary: 'Start comment task',
    description: 'Own KEPT task only. Transitions KEPT -> IN_PROGRESS and writes audit log.',
    roles: [UserRole.BUZZER],
    errors: [401, 403, 404, 409],
  })
  async start(
    @CurrentUser() user: RossUserSession['user'],
    @Param('taskId') taskId: string,
    @Req() request: Request,
  ) {
    const task = await this.commentTasksService.start(
      user,
      taskId,
      getRequestAuditContext(request),
    );
    return successResponse(task);
  }

  @Post('comment-tasks/:taskId/complete')
  @Roles(UserRole.BUZZER)
  @ApiEndpointDoc({
    summary: 'Complete comment task',
    description:
      'Own KEPT or IN_PROGRESS task only. Requires valid proofLink and writes audit log.',
    roles: [UserRole.BUZZER],
    body: CompleteCommentTaskDto,
    errors: [400, 401, 403, 404, 409],
  })
  async complete(
    @CurrentUser() user: RossUserSession['user'],
    @Param('taskId') taskId: string,
    @Body() dto: CompleteCommentTaskDto,
    @Req() request: Request,
  ) {
    const task = await this.commentTasksService.complete(
      user,
      taskId,
      dto,
      getRequestAuditContext(request),
    );
    return successResponse(task);
  }

  @Post('comment-tasks/:taskId/reject')
  @Roles(UserRole.BUZZER)
  @ApiEndpointDoc({
    summary: 'Reject comment task',
    description:
      'Optional/deprecated MVP action. Own KEPT or IN_PROGRESS task only; stores reason in notes and cancels the task.',
    deprecated: true,
    roles: [UserRole.BUZZER],
    body: RejectCommentTaskDto,
    errors: [400, 401, 403, 404, 409],
  })
  async reject(
    @CurrentUser() user: RossUserSession['user'],
    @Param('taskId') taskId: string,
    @Body() dto: RejectCommentTaskDto,
    @Req() request: Request,
  ) {
    const task = await this.commentTasksService.reject(
      user,
      taskId,
      dto,
      getRequestAuditContext(request),
    );
    return successResponse(task);
  }

  @Post('comment-tasks/:taskId/block')
  @Roles(UserRole.BUZZER)
  @ApiEndpointDoc({
    summary: 'Block comment task',
    description:
      'Optional/deprecated MVP action. Own KEPT or IN_PROGRESS task only; stores reason in notes and cancels the task.',
    deprecated: true,
    roles: [UserRole.BUZZER],
    body: BlockCommentTaskDto,
    errors: [400, 401, 403, 404, 409],
  })
  async block(
    @CurrentUser() user: RossUserSession['user'],
    @Param('taskId') taskId: string,
    @Body() dto: BlockCommentTaskDto,
    @Req() request: Request,
  ) {
    const task = await this.commentTasksService.block(
      user,
      taskId,
      dto,
      getRequestAuditContext(request),
    );
    return successResponse(task);
  }
}
