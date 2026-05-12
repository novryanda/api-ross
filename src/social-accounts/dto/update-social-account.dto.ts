import {
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import {
  Platform,
  SocialAccountCategory,
} from '../../generated/prisma/client.js';

export class UpdateSocialAccountDto {
  @IsOptional()
  @IsEnum(Platform)
  platform?: Platform;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  displayName?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  profileUrl?: string;

  @IsOptional()
  @IsEnum(SocialAccountCategory)
  category?: SocialAccountCategory;
}
