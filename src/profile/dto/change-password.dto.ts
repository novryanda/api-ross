import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for the self-service change password endpoint.
 *
 * Fields mirror what Better Auth `/change-password` expects:
 *   - currentPassword (verified by Better Auth)
 *   - newPassword     (8..128 chars)
 *   - revokeOtherSessions (optional, default true)
 *
 * `confirmPassword` is intentionally NOT included here. Confirmation matching
 * is a frontend-only concern; sending it to the backend caused class-validator
 * to reject valid requests when the field was missing or misinterpreted.
 */
export class ChangePasswordDto {
  @ApiProperty({
    description: 'Current password. Validated by Better Auth.',
    minLength: 1,
    example: 'OldPassword123!',
  })
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  @ApiProperty({
    description:
      'New password. Must be 8..128 characters per Better Auth configuration.',
    minLength: 8,
    maxLength: 128,
    example: 'BrandNewPass123!',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;

  @ApiPropertyOptional({
    description:
      'Revoke all other sessions after password change. Defaults to `true` for safety.',
    default: true,
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  revokeOtherSessions?: boolean;
}
