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
import {
  CreateSocialAccountDto,
  SocialAccountQueryDto,
  UpdateSocialAccountDto,
  UpdateSocialAccountStatusDto,
} from './dto/index.js';
import { SocialAccountsService } from './social-accounts.service.js';

@Controller('api/v1/social-accounts')
@UseGuards(RolesGuard)
@ApiTags('Social Accounts')
export class SocialAccountsController {
  constructor(private readonly socialAccountsService: SocialAccountsService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.PIC)
  @ApiEndpointDoc({
    summary: 'List social accounts',
    description:
      'Admin sees every source posting account. PIC sees only the accounts they created for themselves.',
    roles: [UserRole.ADMIN, UserRole.PIC],
    query: SocialAccountQueryDto,
    queryParams: [
      'page',
      'limit',
      'platform',
      'status',
      'search',
      'sortBy',
      'sortOrder',
    ],
    errors: [400, 401, 403],
  })
  async findAll(
    @CurrentUser() user: RossUserSession['user'],
    @Query() query: SocialAccountQueryDto,
  ) {
    const result = await this.socialAccountsService.findAll(user, query);
    return successResponse(result.items, result.meta);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.PIC)
  @ApiEndpointDoc({
    summary: 'Create social account',
    description:
      'Admin can create any source posting account. PIC can self-register the social accounts they personally use for submissions.',
    roles: [UserRole.ADMIN, UserRole.PIC],
    body: CreateSocialAccountDto,
    errors: [400, 401, 403, 409],
  })
  create(
    @CurrentUser() user: RossUserSession['user'],
    @Body() dto: CreateSocialAccountDto,
  ) {
    return this.socialAccountsService.create(user, dto);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.PIC)
  @ApiEndpointDoc({
    summary: 'Get social account detail',
    description: 'Admin can open any account detail. PIC can open only accounts they created.',
    roles: [UserRole.ADMIN, UserRole.PIC],
    errors: [401, 403, 404],
  })
  findOne(
    @CurrentUser() user: RossUserSession['user'],
    @Param('id') id: string,
  ) {
    return this.socialAccountsService.findOne(user, id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.PIC)
  @ApiEndpointDoc({
    summary: 'Update social account',
    description:
      'Admin can update any account. PIC can update only the accounts they created.',
    roles: [UserRole.ADMIN, UserRole.PIC],
    body: UpdateSocialAccountDto,
    errors: [400, 401, 403, 404, 409],
  })
  update(
    @CurrentUser() user: RossUserSession['user'],
    @Param('id') id: string,
    @Body() dto: UpdateSocialAccountDto,
  ) {
    return this.socialAccountsService.update(user, id, dto);
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN, UserRole.PIC)
  @ApiEndpointDoc({
    summary: 'Update social account status',
    description:
      'Admin can change any account status. PIC can archive or activate only their own accounts.',
    roles: [UserRole.ADMIN, UserRole.PIC],
    body: UpdateSocialAccountStatusDto,
    errors: [400, 401, 403, 404],
  })
  updateStatus(
    @CurrentUser() user: RossUserSession['user'],
    @Param('id') id: string,
    @Body() dto: UpdateSocialAccountStatusDto,
  ) {
    return this.socialAccountsService.updateStatus(user, id, dto);
  }
}
