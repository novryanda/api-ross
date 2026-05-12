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
import { CurrentUser, Roles, RolesGuard } from '../auth/index.js';
import type { RossUserSession } from '../auth/auth.types.js';
import { successResponse } from '../common/http/api-response.js';
import { ApiEndpointDoc } from '../common/swagger/api-docs.js';
import { getRequestAuditContext } from '../common/utils/request-audit-context.js';
import { UserRole } from '../generated/prisma/client.js';
import { CommentCommandsService } from './comment-commands.service.js';
import {
  AssignCommentCommandDto,
  CommentCommandQueryDto,
  CreateCommentCommandDto,
  UpdateCommentCommandDto,
  UpdateCommentCommandStatusDto,
} from './dto/index.js';

@Controller('api/v1')
@UseGuards(RolesGuard)
@ApiTags('Comment Commands')
export class CommentCommandsController {
  constructor(
    private readonly commentCommandsService: CommentCommandsService,
  ) {}

  @Get('campaigns/:campaignId/comment-commands')
  @Roles(UserRole.ADMIN)
  @ApiEndpointDoc({
    summary: 'List campaign comment commands',
    description:
      'Admin-only list of PRO/KONTRA comment commands with computed slot counts.',
    roles: [UserRole.ADMIN],
    query: CommentCommandQueryDto,
    queryParams: [
      'page',
      'limit',
      'stance',
      'platform',
      'status',
      'dateFrom',
      'dateTo',
      'search',
      'sortBy',
      'sortOrder',
    ],
    errors: [400, 401, 403, 404],
  })
  async findAll(
    @Param('campaignId') campaignId: string,
    @Query() query: CommentCommandQueryDto,
  ) {
    const result = await this.commentCommandsService.findAll(campaignId, query);
    return successResponse(result.items, result.meta);
  }

  @Post('campaigns/:campaignId/comment-commands')
  @Roles(UserRole.ADMIN)
  @ApiEndpointDoc({
    summary: 'Create comment command',
    description:
      'Creates PRO/KONTRA comment command for a campaign. ACTIVE commands create AVAILABLE CommentTask slots equal to requiredSlots; DRAFT commands create no slots until activated.',
    roles: [UserRole.ADMIN],
    body: CreateCommentCommandDto,
    errors: [400, 401, 403, 404, 409],
  })
  async create(
    @CurrentUser() user: RossUserSession['user'],
    @Param('campaignId') campaignId: string,
    @Body() dto: CreateCommentCommandDto,
    @Req() request: Request,
  ) {
    const command = await this.commentCommandsService.create(
      user,
      campaignId,
      dto,
      getRequestAuditContext(request),
    );
    return successResponse(command);
  }

  @Get('comment-commands/:commandId')
  @Roles(UserRole.ADMIN)
  @ApiEndpointDoc({
    summary: 'Get comment command detail',
    description: 'Admin-only detail with computed slot counts.',
    roles: [UserRole.ADMIN],
    errors: [401, 403, 404],
  })
  async findOne(@Param('commandId') commandId: string) {
    const command = await this.commentCommandsService.findOne(commandId);
    return successResponse(command);
  }

  @Patch('comment-commands/:commandId')
  @Roles(UserRole.ADMIN)
  @ApiEndpointDoc({
    summary: 'Update comment command',
    description:
      'Updates command fields and writes COMMENT_COMMAND_UPDATED audit log. Increasing requiredSlots on ACTIVE commands creates additional AVAILABLE slots.',
    roles: [UserRole.ADMIN],
    body: UpdateCommentCommandDto,
    errors: [400, 401, 403, 404, 409],
  })
  async update(
    @CurrentUser() user: RossUserSession['user'],
    @Param('commandId') commandId: string,
    @Body() dto: UpdateCommentCommandDto,
    @Req() request: Request,
  ) {
    const command = await this.commentCommandsService.update(
      user,
      commandId,
      dto,
      getRequestAuditContext(request),
    );
    return successResponse(command);
  }

  @Patch('comment-commands/:commandId/status')
  @Roles(UserRole.ADMIN)
  @ApiEndpointDoc({
    summary: 'Update comment command status',
    description:
      'Updates DRAFT/ACTIVE/PAUSED/ARCHIVED status. Activating a DRAFT command creates missing AVAILABLE slots.',
    roles: [UserRole.ADMIN],
    body: UpdateCommentCommandStatusDto,
    errors: [400, 401, 403, 404, 409],
  })
  async updateStatus(
    @CurrentUser() user: RossUserSession['user'],
    @Param('commandId') commandId: string,
    @Body() dto: UpdateCommentCommandStatusDto,
    @Req() request: Request,
  ) {
    const command = await this.commentCommandsService.updateStatus(
      user,
      commandId,
      dto,
      getRequestAuditContext(request),
    );
    return successResponse(command);
  }

  @Post('comment-commands/:commandId/assign')
  @Roles(UserRole.ADMIN)
  @ApiEndpointDoc({
    summary: 'Assign comment command to buzzers',
    description:
      'Deprecated. Manual assignment is no longer part of the Comment flow; Buzzers must keep AVAILABLE tasks from the queue.',
    deprecated: true,
    roles: [UserRole.ADMIN],
    body: AssignCommentCommandDto,
    errors: [400, 401, 403, 404, 409],
  })
  async assign(
    @CurrentUser() user: RossUserSession['user'],
    @Param('commandId') commandId: string,
    @Body() dto: AssignCommentCommandDto,
    @Req() request: Request,
  ) {
    const result = await this.commentCommandsService.assign(
      user,
      commandId,
      dto,
      getRequestAuditContext(request),
    );
    return successResponse(result);
  }
}
