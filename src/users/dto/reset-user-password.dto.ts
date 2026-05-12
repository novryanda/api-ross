import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class AdminResetPasswordDto {
  @ApiProperty({
    description: 'New password set by an admin. Hashed by Better Auth.',
    minLength: 8,
    maxLength: 128,
    example: 'Welcome123!',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;

  @ApiPropertyOptional({
    description:
      'Revoke all existing sessions for the target user. Defaults to `true` for safety.',
    default: true,
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  revokeSessions?: boolean;

  @ApiPropertyOptional({
    description:
      'Mark the reset as needing user-driven change on next login. Currently informational only (NEEDS_AUTH_PROVIDER_SUPPORT for enforced flow).',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  requirePasswordChange?: boolean;
}
