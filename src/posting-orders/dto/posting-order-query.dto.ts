import { IsBooleanString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import {
  Platform,
  PostingOrderStatus,
  PostingSubmissionStatus,
} from '../../generated/prisma/client.js';

export class PostingOrderQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  campaignId?: string;

  @IsOptional()
  @IsEnum(PostingOrderStatus)
  status?: PostingOrderStatus;

  @IsOptional()
  @IsEnum(Platform)
  platform?: Platform;

  @IsOptional()
  @IsUUID()
  targetUnitId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsBooleanString()
  eligibleForBlast?: string;

  @IsOptional()
  @IsBooleanString()
  eligibleForComment?: string;

  @IsOptional()
  @IsEnum(PostingSubmissionStatus)
  submissionStatus?: PostingSubmissionStatus;
}
