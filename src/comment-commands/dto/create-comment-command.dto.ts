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

export class CreateCommentCommandDto {
  @ApiProperty({
    example: 'https://www.tiktok.com/@ross_youth/video/1001',
    description: 'Target post URL that Buzzers will comment on.',
  })
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  targetPostUrl!: string;

  @ApiProperty({ enum: Platform, example: Platform.TIKTOK })
  @IsEnum(Platform)
  platform!: Platform;

  @ApiPropertyOptional({
    example: '8e3d83c2-67ec-4976-a1bb-12c91cf801e2',
    description: 'Optional source social account. Platform must match.',
  })
  @IsOptional()
  @IsUUID()
  socialAccountId?: string;

  @ApiProperty({ enum: CommentStance, example: CommentStance.PRO })
  @IsEnum(CommentStance)
  stance!: CommentStance;

  @ApiProperty({
    example: 'Dorong persepsi positif dengan dukungan rasional.',
    maxLength: 5000,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  narrative!: string;

  @ApiPropertyOptional({
    example: 'Tulis komentar natural, tidak copy-paste, dan tetap sopan.',
    maxLength: 5000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  instruction?: string;

  @ApiProperty({
    example: 3,
    minimum: 1,
    description:
      'Number of CommentTask slots to open for first-come, first-served keep.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  requiredSlots!: number;

  @ApiPropertyOptional({
    example: 120,
    default: 120,
    minimum: 1,
    description: 'Keep window in minutes before a kept task can expire.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24 * 60)
  keepExpiryMinutes?: number;

  @ApiProperty({
    example: '2026-05-11T10:00:00.000Z',
    description: 'Required deadline for the command.',
  })
  @IsDateString()
  deadline!: string;

  @ApiPropertyOptional({
    enum: CommentCommandStatus,
    default: CommentCommandStatus.ACTIVE,
    description:
      'ACTIVE commands create AVAILABLE slots immediately. DRAFT commands create no slots until activated.',
  })
  @IsOptional()
  @IsEnum(CommentCommandStatus)
  status?: CommentCommandStatus;
}
