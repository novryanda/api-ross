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
  @Roles(UserRole.ADMIN)
  @ApiEndpointDoc({
    summary: 'List social accounts',
    description:
      'Admin-only list of source posting accounts. SocialAccount is not owned by Buzzer.',
    roles: [UserRole.ADMIN],
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
  async findAll(@Query() query: SocialAccountQueryDto) {
    const result = await this.socialAccountsService.findAll(query);
    return successResponse(result.items, result.meta);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiEndpointDoc({
    summary: 'Create social account',
    description: 'Creates a source posting account managed by Admin.',
    roles: [UserRole.ADMIN],
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
  @Roles(UserRole.ADMIN)
  @ApiEndpointDoc({
    summary: 'Get social account detail',
    description: 'Admin-only social account detail.',
    roles: [UserRole.ADMIN],
    errors: [401, 403, 404],
  })
  findOne(@Param('id') id: string) {
    return this.socialAccountsService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiEndpointDoc({
    summary: 'Update social account',
    description: 'Updates account profile fields and writes audit log.',
    roles: [UserRole.ADMIN],
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
  @Roles(UserRole.ADMIN)
  @ApiEndpointDoc({
    summary: 'Update social account status',
    description: 'Updates active/inactive/archive status. Admin only.',
    roles: [UserRole.ADMIN],
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
