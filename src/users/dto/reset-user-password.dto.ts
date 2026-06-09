import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class AdminResetPasswordDto {
  @ApiPropertyOptional({
    description:
      'Send a reset-password link to the user email instead of setting a plaintext password manually.',
    default: false,
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  sendResetEmail?: boolean;

  @ApiPropertyOptional({
    description:
      'New password set directly by an admin. Required when `sendResetEmail` is false. Hashed by Better Auth.',
    minLength: 8,
    maxLength: 128,
    example: 'Welcome123!',
  })
  @ValidateIf((dto: AdminResetPasswordDto) => !dto.sendResetEmail)
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword?: string;

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
