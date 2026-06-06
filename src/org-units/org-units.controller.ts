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
  CreateOrgUnitDto,
  OrgUnitQueryDto,
  UpdateOrgUnitDto,
} from './dto/index.js';
import { OrgUnitsService } from './org-units.service.js';

@Controller('api/v1/org-units')
@UseGuards(RolesGuard)
@ApiTags('Org Units')
export class OrgUnitsController {
  constructor(private readonly orgUnitsService: OrgUnitsService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.PIC)
  @ApiEndpointDoc({
    summary: 'List org units',
    description:
      'Admin sees all units. PIC sees only their assigned subtree.',
    roles: [UserRole.ADMIN, UserRole.PIC],
    query: OrgUnitQueryDto,
    queryParams: ['page', 'limit', 'status', 'search', 'sortBy', 'sortOrder'],
    errors: [400, 401, 403],
  })
  async findAll(
    @CurrentUser() actor: RossUserSession['user'],
    @Query() query: OrgUnitQueryDto,
  ) {
    const result = await this.orgUnitsService.findAll(actor, query);
    return successResponse(result.items, result.meta);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiEndpointDoc({
    summary: 'Create org unit',
    description: 'Admin-only endpoint for building the PIC hierarchy.',
    roles: [UserRole.ADMIN],
    body: CreateOrgUnitDto,
    errors: [400, 401, 403, 404],
  })
  create(
    @CurrentUser() actor: RossUserSession['user'],
    @Body() dto: CreateOrgUnitDto,
  ) {
    return this.orgUnitsService.create(actor, dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiEndpointDoc({
    summary: 'Update org unit',
    description: 'Admin-only update endpoint for PIC hierarchy nodes.',
    roles: [UserRole.ADMIN],
    body: UpdateOrgUnitDto,
    errors: [400, 401, 403, 404],
  })
  update(
    @CurrentUser() actor: RossUserSession['user'],
    @Param('id') id: string,
    @Body() dto: UpdateOrgUnitDto,
  ) {
    return this.orgUnitsService.update(actor, id, dto);
  }
}
