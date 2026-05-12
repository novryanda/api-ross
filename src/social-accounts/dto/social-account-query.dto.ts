import { IsEnum, IsOptional, IsString } from 'class-validator';
import {
  Platform,
  SocialAccountCategory,
  SocialAccountStatus,
} from '../../generated/prisma/client.js';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export class SocialAccountQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(Platform)
  platform?: Platform;

  @IsOptional()
  @IsEnum(SocialAccountCategory)
  category?: SocialAccountCategory;

  @IsOptional()
  @IsEnum(SocialAccountStatus)
  status?: SocialAccountStatus;

  @IsOptional()
  @IsString()
  search?: string;
}
