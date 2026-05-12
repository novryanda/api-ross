import { IsEnum, IsOptional, IsString, IsUrl, IsUUID } from 'class-validator';
import { Platform } from '../../generated/prisma/client.js';

export class UpdateBlastTargetDto {
  @IsOptional()
  @IsUUID()
  socialAccountId?: string;

  @IsOptional()
  @IsEnum(Platform)
  platform?: Platform;

  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  postUrl?: string;

  @IsOptional()
  @IsString()
  instruction?: string;
}
