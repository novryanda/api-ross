import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { CampaignMemberRole } from '../../generated/prisma/client.js';
import { AddCampaignMemberItemDto } from './add-campaign-member-item.dto.js';

export class AddCampaignMembersDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID(undefined, { each: true })
  userIds?: string[];

  @IsOptional()
  @IsEnum(CampaignMemberRole)
  memberRole?: CampaignMemberRole;

  @IsOptional()
  @ApiPropertyOptional({
    description: 'List of campaign members to add',
    type: AddCampaignMemberItemDto,
    isArray: true,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AddCampaignMemberItemDto)
  members?: AddCampaignMemberItemDto[];
}
