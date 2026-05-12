import { IsEnum, IsOptional } from 'class-validator';
import { BlastAttemptStatus } from '../../generated/prisma/client.js';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export class BlastAttemptQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(BlastAttemptStatus)
  status?: BlastAttemptStatus;
}
