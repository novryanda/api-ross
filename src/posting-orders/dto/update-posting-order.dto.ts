import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { Platform, PostingOrderStatus } from '../../generated/prisma/client.js';

export class UpdatePostingOrderDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  targetUnitId?: string;

  @ApiPropertyOptional({ enum: Platform })
  @IsOptional()
  @IsEnum(Platform)
  platform?: Platform;

  @ApiPropertyOptional({ format: 'uri' })
  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  contentDriveUrl?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  caption?: string;

  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ enum: PostingOrderStatus })
  @IsOptional()
  @IsEnum(PostingOrderStatus)
  status?: PostingOrderStatus;
}
