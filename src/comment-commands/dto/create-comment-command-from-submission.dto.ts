import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CommentCommandStatus,
  CommentStance,
} from '../../generated/prisma/client.js';

export class CreateCommentCommandFromSubmissionDto {
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
