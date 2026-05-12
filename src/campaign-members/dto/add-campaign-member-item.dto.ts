import { IsEnum, IsUUID } from 'class-validator';
import { CampaignMemberRole } from '../../generated/prisma/client.js';

export class AddCampaignMemberItemDto {
  @IsUUID()
  userId!: string;

  @IsEnum(CampaignMemberRole)
  memberRole!: CampaignMemberRole;
}
