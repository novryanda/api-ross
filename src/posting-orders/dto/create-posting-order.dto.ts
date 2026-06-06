import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { Platform } from '../../generated/prisma/client.js';

export class CreatePostingOrderDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  targetUnitId!: string;

  @ApiProperty({ enum: Platform })
  @IsEnum(Platform)
  platform!: Platform;

  @ApiProperty({ format: 'uri' })
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  contentDriveUrl!: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  scheduledAt!: string;

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
}
