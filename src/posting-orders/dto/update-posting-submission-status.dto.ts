import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PostingSubmissionStatus } from '../../generated/prisma/client.js';

export class UpdatePostingSubmissionStatusDto {
  @ApiProperty({
    enum: PostingSubmissionStatus,
    description: 'Admin review status. Use APPROVED_FOR_BLAST or REJECTED.',
  })
  @IsEnum(PostingSubmissionStatus)
  status!: PostingSubmissionStatus;

  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  reviewNotes?: string;
}
