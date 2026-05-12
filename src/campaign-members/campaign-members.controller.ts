import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
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
import { CampaignMembersService } from './campaign-members.service.js';
import { AddCampaignMembersDto, MemberQueryDto } from './dto/index.js';

@Controller('api/v1/campaigns/:campaignId/members')
@UseGuards(RolesGuard)
@ApiTags('Campaign Members')
export class CampaignMembersController {
  constructor(
    private readonly campaignMembersService: CampaignMembersService,
  ) {}

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiEndpointDoc({
    summary: 'List campaign members',
    description: 'Admin-only member list for a campaign.',
    roles: [UserRole.ADMIN],
    query: MemberQueryDto,
    queryParams: ['page', 'limit', 'role', 'search', 'sortBy', 'sortOrder'],
    errors: [400, 401, 403, 404],
  })
  async findAll(
    @CurrentUser() user: RossUserSession['user'],
    @Param('campaignId') campaignId: string,
    @Query() query: MemberQueryDto,
  ) {
    const result = await this.campaignMembersService.findAll(
      user,
      campaignId,
      query,
    );
    return successResponse(result.items, result.meta);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiEndpointDoc({
    summary: 'Add campaign members',
    description:
      'Adds users to a campaign and writes campaign member audit events.',
    roles: [UserRole.ADMIN],
    body: AddCampaignMembersDto,
    errors: [400, 401, 403, 404, 409],
  })
  addMembers(
    @CurrentUser() user: RossUserSession['user'],
    @Param('campaignId') campaignId: string,
    @Body() dto: AddCampaignMembersDto,
  ) {
    return this.campaignMembersService.addMembers(user, campaignId, dto);
  }

  @Delete(':userId')
  @Roles(UserRole.ADMIN)
  @ApiEndpointDoc({
    summary: 'Remove campaign member',
    description: 'Removes a campaign member. Admin only.',
    roles: [UserRole.ADMIN],
    errors: [401, 403, 404],
  })
  removeMember(
    @CurrentUser() user: RossUserSession['user'],
    @Param('campaignId') campaignId: string,
    @Param('userId') userId: string,
  ) {
    return this.campaignMembersService.removeMember(user, campaignId, userId);
  }
}
