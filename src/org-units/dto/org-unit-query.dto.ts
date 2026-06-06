import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { OrgUnitStatus } from '../../generated/prisma/client.js';

export class OrgUnitQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(OrgUnitStatus)
  status?: OrgUnitStatus;

  @IsOptional()
  @IsString()
  search?: string;
}
