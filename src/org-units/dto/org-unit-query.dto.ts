import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { OrgUnitStatus } from '../../generated/prisma/client.js';
import {
  ORG_UNIT_PIC_ASSIGNED_FILTERS,
  ORG_UNIT_VIEW_MODES,
  type OrgUnitPicAssignedFilter,
  type OrgUnitViewMode,
} from '../org-units.constants.js';

export class OrgUnitQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(OrgUnitStatus)
  status?: OrgUnitStatus;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  level?: number;

  @IsOptional()
  @IsIn(ORG_UNIT_PIC_ASSIGNED_FILTERS)
  picAssigned?: OrgUnitPicAssignedFilter;

  @IsOptional()
  @IsIn(ORG_UNIT_VIEW_MODES)
  view?: OrgUnitViewMode;
}
