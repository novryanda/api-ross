import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { UserRole } from '../generated/prisma/client.js';
import { CurrentUser, Roles, RolesGuard } from '../auth/index.js';
import type { RossUserSession } from '../auth/auth.types.js';
import { successResponse } from '../common/http/api-response.js';
import { ApiEndpointDoc } from '../common/swagger/api-docs.js';
import { getRequestAuditContext } from '../common/utils/request-audit-context.js';
import { UsersService } from './users.service.js';
import {
  AdminResetPasswordDto,
  CreateUserDto,
  ListUsersQueryDto,
  UpdateUserDto,
  UpdateUserStatusDto,
} from './dto/index.js';

@Controller('api/v1/users')
@UseGuards(RolesGuard)
@ApiTags('Users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiEndpointDoc({
    summary: 'List users',
    description:
      'Admin-only paginated list of system users with role/status filters and campaignCount aggregate.',
    roles: [UserRole.ADMIN],
    query: ListUsersQueryDto,
    queryParams: [
      'page',
      'limit',
      'search',
      'role',
      'status',
      'sortBy',
      'sortOrder',
    ],
    errors: [400, 401, 403],
  })
  async findAll(@Query() query: ListUsersQueryDto) {
    const result = await this.usersService.findAll(query);
    return successResponse(result.items, result.meta);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiEndpointDoc({
    summary: 'Create user',
    description:
      'Creates a system user. Better Auth hashes `temporaryPassword` when provided. `requirePasswordChange` is only recorded in the audit log (NEEDS_AUTH_PROVIDER_SUPPORT).',
    roles: [UserRole.ADMIN],
    body: CreateUserDto,
    errors: [400, 401, 403, 404, 409],
  })
  async create(
    @CurrentUser() actor: RossUserSession['user'],
    @Body() dto: CreateUserDto,
    @Req() request: Request,
  ) {
    const audit = getRequestAuditContext(request);
    const created = await this.usersService.create(actor, dto, {
      ip: audit.ipAddress,
      userAgent: audit.userAgent,
    });
    return successResponse(created);
  }

  @Get(':userId')
  @Roles(UserRole.ADMIN)
  @ApiEndpointDoc({
    summary: 'Get user detail',
    description:
      'Returns the user with campaign memberships. Activity aggregates live on /users/:userId/activity-summary to keep this endpoint fast.',
    roles: [UserRole.ADMIN],
    errors: [401, 403, 404],
  })
  async findOne(@Param('userId', new ParseUUIDPipe()) userId: string) {
    const user = await this.usersService.findOne(userId);
    return successResponse(user);
  }

  @Patch(':userId')
  @Roles(UserRole.ADMIN)
  @ApiEndpointDoc({
    summary: 'Update user',
    description:
      'Partial update. Protects the last active admin and refuses self-deactivation. Writes USER_UPDATED and USER_STATUS_CHANGED audit events as needed.',
    roles: [UserRole.ADMIN],
    body: UpdateUserDto,
    errors: [400, 401, 403, 404, 409],
  })
  async update(
    @CurrentUser() actor: RossUserSession['user'],
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() dto: UpdateUserDto,
    @Req() request: Request,
  ) {
    const audit = getRequestAuditContext(request);
    const updated = await this.usersService.update(actor, userId, dto, {
      ip: audit.ipAddress,
      userAgent: audit.userAgent,
    });
    return successResponse(updated);
  }

  @Patch(':userId/status')
  @Roles(UserRole.ADMIN)
  @ApiEndpointDoc({
    summary: 'Change user status',
    description:
      'Activates or deactivates a user. Deactivation also revokes any existing sessions. Last-active-admin and self-deactivation are blocked.',
    roles: [UserRole.ADMIN],
    body: UpdateUserStatusDto,
    errors: [400, 401, 403, 404],
  })
  async updateStatus(
    @CurrentUser() actor: RossUserSession['user'],
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() dto: UpdateUserStatusDto,
    @Req() request: Request,
  ) {
    const audit = getRequestAuditContext(request);
    const updated = await this.usersService.updateStatus(actor, userId, dto, {
      ip: audit.ipAddress,
      userAgent: audit.userAgent,
    });
    return successResponse(updated);
  }

  @Post(':userId/reset-password')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiEndpointDoc({
    summary: 'Admin reset password',
    description:
      'Hashes the new password with Better Auth crypto and stores it on the credential account. Revokes existing sessions by default. No plaintext is stored or returned.',
    roles: [UserRole.ADMIN],
    body: AdminResetPasswordDto,
    errors: [400, 401, 403, 404],
  })
  async resetPassword(
    @CurrentUser() actor: RossUserSession['user'],
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() dto: AdminResetPasswordDto,
    @Req() request: Request,
  ) {
    const audit = getRequestAuditContext(request);
    const result = await this.usersService.resetPassword(actor, userId, dto, {
      ip: audit.ipAddress,
      userAgent: audit.userAgent,
    });
    return successResponse(result);
  }

  @Get(':userId/activity-summary')
  @Roles(UserRole.ADMIN)
  @ApiEndpointDoc({
    summary: 'User activity summary',
    description:
      'Returns aggregate counts for a user (completed blasts, comments, reports, campaigns) and a derived lastActivityAt timestamp. For non-Buzzer roles the counts are typically 0.',
    roles: [UserRole.ADMIN],
    errors: [401, 403, 404],
  })
  async getActivitySummary(
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    const summary = await this.usersService.getActivitySummary(userId);
    return successResponse(summary);
  }
}
