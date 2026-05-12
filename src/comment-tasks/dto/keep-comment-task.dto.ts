import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class KeepCommentTaskDto {
  @ApiPropertyOptional({
    example: 120,
    minimum: 1,
    description:
      'Optional override for keep duration. Defaults to command keepExpiryMinutes.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24 * 60)
  keepDurationMinutes?: number;
}
