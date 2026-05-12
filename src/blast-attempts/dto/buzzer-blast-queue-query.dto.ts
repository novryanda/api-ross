import { IsEnum, IsOptional } from 'class-validator';
import { Platform } from '../../generated/prisma/client.js';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export class BuzzerBlastQueueQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(Platform)
  platform?: Platform;
}
