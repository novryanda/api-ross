import { IsEnum, IsOptional, IsString } from 'class-validator';
import {
  CampaignMemberRole,
  UserStatus,
} from '../../generated/prisma/client.js';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export class MemberQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(CampaignMemberRole)
  memberRole?: CampaignMemberRole;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsString()
  search?: string;
}
