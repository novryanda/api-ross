import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { UserRole, UserStatus } from '../../generated/prisma/client.js';

export class ListUsersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by role.',
    enum: UserRole,
    example: UserRole.BUZZER,
  })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({
    description: 'Filter by user status.',
    enum: UserStatus,
    example: UserStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({
    description: 'Case-insensitive substring search across name/email.',
    maxLength: 200,
    example: 'buzzer',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
