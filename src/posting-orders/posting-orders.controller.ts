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
  CreatePostingOrderDto,
  PostingOrderQueryDto,
  SubmitPostingOrderDto,
  UpdatePostingOrderDto,
  UpdatePostingSubmissionStatusDto,
} from './dto/index.js';
import { PostingOrdersService } from './posting-orders.service.js';

@Controller('api/v1')
@UseGuards(RolesGuard)
@ApiTags('Posting Orders', 'Posting Submissions')
export class PostingOrdersController {
  constructor(private readonly postingOrdersService: PostingOrdersService) {}

  @Get('posting-orders')
  @Roles(UserRole.ADMIN)
  @ApiEndpointDoc({
    summary: 'List posting orders',
    description: 'Admin-only listing for all posting orders across campaigns.',
    roles: [UserRole.ADMIN],
    query: PostingOrderQueryDto,
    queryParams: ['page', 'limit', 'campaignId', 'status', 'platform', 'targetUnitId', 'search', 'sortBy', 'sortOrder'],
    errors: [400, 401, 403],
  })
  async listOrders(
    @CurrentUser() actor: RossUserSession['user'],
    @Query() query: PostingOrderQueryDto,
  ) {
    const result = await this.postingOrdersService.listOrders(actor, query);
    return successResponse(result.items, result.meta);
  }

  @Get('campaigns/:campaignId/posting-orders')
  @Roles(UserRole.ADMIN)
  @ApiEndpointDoc({
    summary: 'List campaign posting orders',
    description: 'Admin-only listing for the posting bank inside a campaign.',
    roles: [UserRole.ADMIN],
    query: PostingOrderQueryDto,
    queryParams: ['page', 'limit', 'status', 'platform', 'targetUnitId', 'search', 'sortBy', 'sortOrder'],
    errors: [400, 401, 403, 404],
  })
  async listCampaignOrders(
    @CurrentUser() actor: RossUserSession['user'],
    @Param('campaignId') campaignId: string,
    @Query() query: PostingOrderQueryDto,
  ) {
    const result = await this.postingOrdersService.listCampaignOrders(
      actor,
      campaignId,
      query,
    );
    return successResponse(result.items, result.meta);
  }

  @Post('campaigns/:campaignId/posting-orders')
  @Roles(UserRole.ADMIN)
  @ApiEndpointDoc({
    summary: 'Create posting order',
    description: 'Admin-only endpoint for publishing a posting order to a PIC unit.',
    roles: [UserRole.ADMIN],
    body: CreatePostingOrderDto,
    errors: [400, 401, 403, 404],
  })
  createOrder(
    @CurrentUser() actor: RossUserSession['user'],
    @Param('campaignId') campaignId: string,
    @Body() dto: CreatePostingOrderDto,
  ) {
    return this.postingOrdersService.createOrder(actor, campaignId, dto);
  }

  @Get('posting-orders/:id')
  @Roles(UserRole.ADMIN, UserRole.PIC)
  @ApiEndpointDoc({
    summary: 'Get posting order detail',
    description: 'Admin sees any order; PIC sees orders from their subtree when available or claimed by them.',
    roles: [UserRole.ADMIN, UserRole.PIC],
    errors: [401, 403, 404],
  })
  getOrder(
    @CurrentUser() actor: RossUserSession['user'],
    @Param('id') id: string,
  ) {
    return this.postingOrdersService.getOrder(actor, id);
  }

  @Patch('posting-orders/:id')
  @Roles(UserRole.ADMIN)
  @ApiEndpointDoc({
    summary: 'Update posting order',
    description: 'Admin-only partial update for posting orders.',
    roles: [UserRole.ADMIN],
    body: UpdatePostingOrderDto,
    errors: [400, 401, 403, 404, 409],
  })
  updateOrder(
    @CurrentUser() actor: RossUserSession['user'],
    @Param('id') id: string,
    @Body() dto: UpdatePostingOrderDto,
  ) {
    return this.postingOrdersService.updateOrder(actor, id, dto);
  }

  @Get('pic/posting-queue')
  @Roles(UserRole.PIC)
  @ApiEndpointDoc({
    summary: 'Get PIC posting queue',
    description: 'Lists available posting orders for the PIC subtree plus the actor’s currently claimed orders.',
    roles: [UserRole.PIC],
    query: PostingOrderQueryDto,
    queryParams: ['page', 'limit', 'platform', 'search', 'sortBy', 'sortOrder'],
    errors: [400, 401, 403],
  })
  async getPicQueue(
    @CurrentUser() actor: RossUserSession['user'],
    @Query() query: PostingOrderQueryDto,
  ) {
    const result = await this.postingOrdersService.getPicQueue(actor, query);
    return successResponse(result.items, result.meta);
  }

  @Get('pic/my-submissions')
  @Roles(UserRole.PIC)
  @ApiEndpointDoc({
    summary: 'Get PIC submissions',
    description: 'Lists posting submissions created by the authenticated PIC.',
    roles: [UserRole.PIC],
    query: PostingOrderQueryDto,
    queryParams: ['page', 'limit', 'submissionStatus', 'platform', 'sortOrder'],
    errors: [400, 401, 403],
  })
  async getMySubmissions(
    @CurrentUser() actor: RossUserSession['user'],
    @Query() query: PostingOrderQueryDto,
  ) {
    const result = await this.postingOrdersService.getMySubmissions(actor, query);
    return successResponse(result.items, result.meta);
  }

  @Post('posting-orders/:id/claim')
  @Roles(UserRole.PIC)
  @ApiEndpointDoc({
    summary: 'Claim posting order',
    description: 'Atomic queue claim for PIC users.',
    roles: [UserRole.PIC],
    errors: [401, 403, 404, 409],
  })
  claimOrder(
    @CurrentUser() actor: RossUserSession['user'],
    @Param('id') id: string,
  ) {
    return this.postingOrdersService.claimOrder(actor, id);
  }

  @Post('posting-orders/:id/release')
  @Roles(UserRole.ADMIN, UserRole.PIC)
  @ApiEndpointDoc({
    summary: 'Release posting order',
    description: 'Admin can release any claim; PIC can release only their own claimed order.',
    roles: [UserRole.ADMIN, UserRole.PIC],
    errors: [401, 403, 404, 409],
  })
  releaseOrder(
    @CurrentUser() actor: RossUserSession['user'],
    @Param('id') id: string,
  ) {
    return this.postingOrdersService.releaseOrder(actor, id);
  }

  @Post('posting-orders/:id/submit')
  @Roles(UserRole.PIC)
  @ApiEndpointDoc({
    summary: 'Submit posting result',
    description: 'PIC submits the final posted URL, proof Drive URL, and the PIC-owned social account used for the posting.',
    roles: [UserRole.PIC],
    body: SubmitPostingOrderDto,
    errors: [400, 401, 403, 404, 409],
  })
  submitOrder(
    @CurrentUser() actor: RossUserSession['user'],
    @Param('id') id: string,
    @Body() dto: SubmitPostingOrderDto,
  ) {
    return this.postingOrdersService.submitOrder(actor, id, dto);
  }

  @Get('campaigns/:campaignId/pic-submissions')
  @Roles(UserRole.ADMIN)
  @ApiEndpointDoc({
    summary: 'List PIC submissions for a campaign',
    description: 'Admin listing for campaign submissions. Use eligibleForBlast=true or eligibleForComment=true to fetch only conversion-ready rows.',
    roles: [UserRole.ADMIN],
    query: PostingOrderQueryDto,
    queryParams: ['page', 'limit', 'platform', 'submissionStatus', 'eligibleForBlast', 'eligibleForComment', 'sortOrder'],
    errors: [400, 401, 403, 404],
  })
  async listCampaignSubmissions(
    @CurrentUser() actor: RossUserSession['user'],
    @Param('campaignId') campaignId: string,
    @Query() query: PostingOrderQueryDto,
  ) {
    const result = await this.postingOrdersService.listCampaignSubmissions(
      actor,
      campaignId,
      query,
    );
    return successResponse(result.items, result.meta);
  }

  @Patch('posting-submissions/:submissionId/status')
  @Roles(UserRole.ADMIN)
  @ApiEndpointDoc({
    summary: 'Review PIC submission status',
    description: 'Admin review endpoint for approving a submission for blast or rejecting it.',
    roles: [UserRole.ADMIN],
    body: UpdatePostingSubmissionStatusDto,
    errors: [400, 401, 403, 404, 409],
  })
  reviewSubmission(
    @CurrentUser() actor: RossUserSession['user'],
    @Param('submissionId') submissionId: string,
    @Body() dto: UpdatePostingSubmissionStatusDto,
  ) {
    return this.postingOrdersService.reviewSubmission(actor, submissionId, dto);
  }
}
