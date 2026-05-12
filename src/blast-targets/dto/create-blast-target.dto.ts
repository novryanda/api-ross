import { IsEnum, IsOptional, IsString, IsUrl, IsUUID } from 'class-validator';
import {
  BlastSourceType,
  BlastTargetStatus,
  Platform,
  ReviewStatus,
} from '../../generated/prisma/client.js';

export class CreateBlastTargetDto {
  @IsUUID()
  socialAccountId!: string;

  @IsEnum(Platform)
  platform!: Platform;

  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  postUrl!: string;

  @IsOptional()
  @IsString()
  instruction?: string;

  @IsOptional()
  @IsEnum(BlastSourceType)
  sourceType?: BlastSourceType;

  @IsOptional()
  @IsEnum(ReviewStatus)
  reviewStatus?: ReviewStatus;

  @IsOptional()
  @IsEnum(BlastTargetStatus)
  status?: BlastTargetStatus;
}
