import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { pipeline } from 'node:stream/promises';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles, RolesGuard } from '../auth/index.js';
import type { RossUserSession } from '../auth/auth.types.js';
import { successResponse } from '../common/http/api-response.js';
import { ApiEndpointDoc } from '../common/swagger/api-docs.js';
import { getRequestAuditContext } from '../common/utils/request-audit-context.js';
import { UserRole } from '../generated/prisma/client.js';
import { CreateExportDto, ExportQueryDto } from './dto/index.js';
import { ExportsService } from './exports.service.js';

@Controller('api/v1')
@UseGuards(RolesGuard)
@ApiTags('Exports')
export class ExportsController {
  private readonly logger = new Logger(ExportsController.name);

  constructor(private readonly exportsService: ExportsService) {}

  @Post('campaigns/:campaignId/exports')
  @Roles(UserRole.ADMIN)
  @ApiEndpointDoc({
    summary: 'Request campaign export',
    description:
      'Generates a PDF/XLSX snapshot for the campaign using the requested scope and optional date range. Files are stored in private Cloudflare R2. Audit: EXPORT_REQUESTED + EXPORT_COMPLETED or EXPORT_FAILED.',
    roles: [UserRole.ADMIN],
    body: CreateExportDto,
    errors: [400, 401, 403, 404],
  })
  async create(
    @CurrentUser() user: RossUserSession['user'],
    @Param('campaignId') campaignId: string,
    @Body() dto: CreateExportDto,
    @Req() request: Request,
  ) {
    const exportReport = await this.exportsService.create(
      user,
      campaignId,
      dto,
      getRequestAuditContext(request),
    );
    return successResponse(exportReport);
  }

  @Get('exports')
  @Roles(UserRole.ADMIN, UserRole.VIEWER)
  @ApiEndpointDoc({
    summary: 'List exports',
    description:
      'Admin sees all exports. Viewer sees completed exports for accessible campaigns only.',
    roles: [UserRole.ADMIN, UserRole.VIEWER],
    query: ExportQueryDto,
    queryParams: [
      'page',
      'limit',
      'campaignId',
      'format',
      'scope',
      'status',
      'requestedBy',
      'dateFrom',
      'dateTo',
      'sortBy',
      'sortOrder',
    ],
    errors: [400, 401, 403],
  })
  async findAll(
    @CurrentUser() user: RossUserSession['user'],
    @Query() query: ExportQueryDto,
  ) {
    const result = await this.exportsService.findAll(user, query);
    return successResponse({ items: result.items, pagination: result.meta });
  }

  @Get('exports/:exportId')
  @Roles(UserRole.ADMIN, UserRole.VIEWER)
  @ApiEndpointDoc({
    summary: 'Get export metadata',
    description:
      'Returns export metadata. Viewer requires campaign membership and status COMPLETED.',
    roles: [UserRole.ADMIN, UserRole.VIEWER],
    errors: [401, 403, 404],
  })
  async findOne(
    @CurrentUser() user: RossUserSession['user'],
    @Param('exportId') exportId: string,
  ) {
    const exportReport = await this.exportsService.findOne(user, exportId);
    return successResponse(exportReport);
  }

  @Get('exports/:exportId/download')
  @Roles(UserRole.ADMIN, UserRole.VIEWER)
  @ApiEndpointDoc({
    summary: 'Download export file',
    description:
      'Streams the generated artefact from Cloudflare R2 through the backend endpoint. Requires status COMPLETED. Writes EXPORT_DOWNLOADED audit log. Error codes: EXPORT_NOT_READY (409), EXPORT_FILE_NOT_FOUND (404).',
    roles: [UserRole.ADMIN, UserRole.VIEWER],
    errors: [401, 403, 404, 409],
  })
  async download(
    @CurrentUser() user: RossUserSession['user'],
    @Param('exportId') exportId: string,
    @Req() request: Request,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(`Download requested for export ${exportId} by ${user.id}`);
    const { stream, fileName, mimeType, fileSize } =
      await this.exportsService.openForDownload(
        user,
        exportId,
        getRequestAuditContext(request),
      );

    const headers: Record<string, string> = {
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="${fileName.replace(/"/g, '')}"`,
    };
    if (fileSize !== null && fileSize !== undefined) {
      headers['Content-Length'] = String(fileSize);
    }
    res.set(headers);

    await pipeline(stream, res);
  }

  @Post('exports/:exportId/retry')
  @Roles(UserRole.ADMIN)
  @ApiEndpointDoc({
    summary: 'Retry a failed export',
    description:
      'Creates a new ExportReport row linked to the source via `retriedFromId` and runs generation again. Only allowed when source status = FAILED. Writes EXPORT_REQUESTED + EXPORT_RETRIED + EXPORT_COMPLETED/EXPORT_FAILED.',
    roles: [UserRole.ADMIN],
    errors: [401, 403, 404, 409],
  })
  async retry(
    @CurrentUser() user: RossUserSession['user'],
    @Param('exportId') exportId: string,
    @Req() request: Request,
  ) {
    const created = await this.exportsService.retry(
      user,
      exportId,
      getRequestAuditContext(request),
    );
    return successResponse(created);
  }
}
