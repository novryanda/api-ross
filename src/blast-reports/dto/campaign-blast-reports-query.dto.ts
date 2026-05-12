import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { Platform } from '../../generated/prisma/client.js';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export class CampaignBlastReportsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(Platform)
  platform?: Platform;

  @IsOptional()
  @IsUUID()
  submittedBy?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
