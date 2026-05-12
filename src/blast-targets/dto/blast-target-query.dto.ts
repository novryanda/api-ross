import { IsEnum, IsOptional, IsString } from 'class-validator';
import {
  BlastTargetStatus,
  Platform,
  ReviewStatus,
} from '../../generated/prisma/client.js';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export class BlastTargetQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(Platform)
  platform?: Platform;

  @IsOptional()
  @IsEnum(BlastTargetStatus)
  status?: BlastTargetStatus;

  @IsOptional()
  @IsEnum(ReviewStatus)
  reviewStatus?: ReviewStatus;

  @IsOptional()
  @IsString()
  search?: string;
}
