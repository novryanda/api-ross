import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { OrgUnitStatus } from '../../generated/prisma/client.js';

export class CreateOrgUnitDto {
  @ApiProperty({ minLength: 2, maxLength: 150, example: 'Angkatan Darat' })
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name!: string;

  @ApiPropertyOptional({ maxLength: 80, example: 'AD' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  code?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiPropertyOptional({ enum: OrgUnitStatus, default: OrgUnitStatus.ACTIVE })
  @IsOptional()
  @IsEnum(OrgUnitStatus)
  status?: OrgUnitStatus;
}
