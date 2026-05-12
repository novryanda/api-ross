import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import {
  Platform,
  SocialAccountCategory,
  SocialAccountStatus,
} from '../../generated/prisma/client.js';

export class CreateSocialAccountDto {
  @IsEnum(Platform)
  platform!: Platform;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  username!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  displayName!: string;

  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  profileUrl!: string;

  @IsEnum(SocialAccountCategory)
  category!: SocialAccountCategory;

  @IsOptional()
  @IsEnum(SocialAccountStatus)
  status?: SocialAccountStatus;
}
