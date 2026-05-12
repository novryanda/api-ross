import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CommentCommandStatus,
  CommentStance,
  Platform,
} from '../../generated/prisma/client.js';

export class UpdateCommentCommandDto {
  @ApiPropertyOptional({
    example: 'https://www.tiktok.com/@ross_youth/video/1001',
  })
  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  targetPostUrl?: string;

  @ApiPropertyOptional({ enum: Platform, example: Platform.TIKTOK })
  @IsOptional()
  @IsEnum(Platform)
  platform?: Platform;

  @ApiPropertyOptional({
    example: '8e3d83c2-67ec-4976-a1bb-12c91cf801e2',
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  socialAccountId?: string;

  @ApiPropertyOptional({ enum: CommentStance, example: CommentStance.PRO })
  @IsOptional()
  @IsEnum(CommentStance)
  stance?: CommentStance;

  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  narrative?: string;

  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  instruction?: string;

  @ApiPropertyOptional({
    minimum: 1,
    description:
      'Can increase slots. Existing tasks are not deleted when lowering this value.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  requiredSlots?: number;

  @ApiPropertyOptional({ default: 120, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24 * 60)
  keepExpiryMinutes?: number;

  @ApiPropertyOptional({ example: '2026-05-11T10:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  deadline?: string;
}

export class UpdateCommentCommandStatusDto {
  @ApiProperty({
    enum: CommentCommandStatus,
    example: CommentCommandStatus.PAUSED,
  })
  @IsEnum(CommentCommandStatus)
  status!: CommentCommandStatus;
}
