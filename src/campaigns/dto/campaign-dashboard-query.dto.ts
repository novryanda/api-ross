import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { Platform } from '../../generated/prisma/client.js';

export class CampaignDashboardQueryDto {
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsEnum(Platform)
  platform?: Platform;
}
