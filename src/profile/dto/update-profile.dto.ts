import {
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({
    description:
      'Display name for the current user. Email and role are never mutated through this endpoint.',
    minLength: 2,
    maxLength: 150,
    example: 'Jane Admin',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional({
    description:
      'Avatar/profile image URL. Use `null` to clear (not yet supported via this DTO; omit instead).',
    example: 'https://cdn.example.com/avatars/jane.png',
    format: 'url',
  })
  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @MaxLength(2048)
  image?: string;
}
