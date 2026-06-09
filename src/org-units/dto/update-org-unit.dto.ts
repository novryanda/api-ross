import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { OrgUnitStatus } from '../../generated/prisma/client.js';

export class UpdateOrgUnitDto {
  @ApiPropertyOptional({ minLength: 2, maxLength: 150 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  code?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Set to null to move unit to top level.',
  })
  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @ApiPropertyOptional({ enum: OrgUnitStatus })
  @IsOptional()
  @IsEnum(OrgUnitStatus)
  status?: OrgUnitStatus;
}
