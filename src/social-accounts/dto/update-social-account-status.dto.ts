import { IsEnum } from 'class-validator';
import { SocialAccountStatus } from '../../generated/prisma/client.js';

export class UpdateSocialAccountStatusDto {
  @IsEnum(SocialAccountStatus)
  status!: SocialAccountStatus;
}
