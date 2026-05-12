import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserRole, UserStatus } from '../../generated/prisma/client.js';

export class CreateUserDto {
  @ApiProperty({
    description: 'Full name.',
    minLength: 2,
    maxLength: 150,
    example: 'Buzzer Dewi',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name!: string;

  @ApiProperty({
    description: 'Email address. Unique across the system.',
    example: 'buzzer.dewi@ross.local',
    format: 'email',
  })
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty({
    description: 'System role.',
    enum: UserRole,
    example: UserRole.BUZZER,
  })
  @IsEnum(UserRole)
  role!: UserRole;

  @ApiPropertyOptional({
    description: 'Activation status. Defaults to ACTIVE.',
    enum: UserStatus,
    default: UserStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({
    description:
      'Optional campaign memberships to create immediately (role is taken from the system `role` if a campaign membership role is not separately specified).',
    type: [String],
    maxItems: 100,
    example: ['10000000-0000-4000-8000-000000000001'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  campaignIds?: string[];

  @ApiPropertyOptional({
    description:
      'Temporary password for the new user (Better Auth hashes it). If omitted the user is created without a credential account and an admin must call reset-password later.',
    minLength: 8,
    maxLength: 128,
    example: 'TempPass123!',
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  temporaryPassword?: string;

  @ApiPropertyOptional({
    description:
      'Flag the user to require a password change on first login. Currently stored only in the audit log because Better Auth does not expose a built-in forceChangePassword field yet (NEEDS_AUTH_PROVIDER_SUPPORT).',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  requirePasswordChange?: boolean;

  @ApiPropertyOptional({
    description:
      'Internal notes for the audit log. Not stored on the User row.',
    maxLength: 1000,
    example: 'Onboarding batch Q2-2026',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
