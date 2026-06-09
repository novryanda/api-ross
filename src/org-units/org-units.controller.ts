import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
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
  MoveOrgUnitDto,
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
      'Admin sees all units. PIC sees only their assigned subtree. Supports flat pagination or tree view.',
    roles: [UserRole.ADMIN, UserRole.PIC],
    queryParams: [
      'page',
      'limit',
      'status',
      'search',
      'level',
      'picAssigned',
      'view',
      'sortBy',
      'sortOrder',
    ],
    errors: [400, 401, 403],
  })
  async findAll(
    @CurrentUser() actor: RossUserSession['user'],
    @Query() query: OrgUnitQueryDto,
  ) {
    const result = await this.orgUnitsService.findAll(actor, query);
    return successResponse(result.items, result.meta);
  }

  @Get('export')
  @Roles(UserRole.ADMIN)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="pic-structure.csv"')
  @ApiEndpointDoc({
    summary: 'Export org units',
    description:
      'Admin-only CSV export for PIC structure with the same filters as list endpoint.',
    roles: [UserRole.ADMIN],
    errors: [400, 401, 403],
  })
  async export(
    @CurrentUser() actor: RossUserSession['user'],
    @Query() query: OrgUnitQueryDto,
  ) {
    return this.orgUnitsService.exportCsv(actor, query);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.PIC)
  @ApiEndpointDoc({
    summary: 'Get org unit detail',
    description:
      'Returns org unit metadata, ancestor chain, and assigned PIC members.',
    roles: [UserRole.ADMIN, UserRole.PIC],
    errors: [401, 403, 404],
  })
  async findOne(
    @CurrentUser() actor: RossUserSession['user'],
    @Param('id') id: string,
  ) {
    const unit = await this.orgUnitsService.findOne(actor, id);
    return successResponse(unit);
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

  @Patch(':id/move')
  @Roles(UserRole.ADMIN)
  @ApiEndpointDoc({
    summary: 'Move org unit',
    description:
      'Admin-only endpoint to change parent of a PIC hierarchy node.',
    roles: [UserRole.ADMIN],
    body: MoveOrgUnitDto,
    errors: [400, 401, 403, 404],
  })
  move(
    @CurrentUser() actor: RossUserSession['user'],
    @Param('id') id: string,
    @Body() dto: MoveOrgUnitDto,
  ) {
    return this.orgUnitsService.move(actor, id, dto);
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

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiEndpointDoc({
    summary: 'Delete org unit',
    description:
      'Admin-only delete endpoint for PIC hierarchy nodes that no longer have children, assigned PIC users, or posting orders.',
    roles: [UserRole.ADMIN],
    errors: [400, 401, 403, 404],
  })
  remove(
    @CurrentUser() actor: RossUserSession['user'],
    @Param('id') id: string,
  ) {
    return this.orgUnitsService.remove(actor, id);
  }
}
