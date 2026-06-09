import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class MoveOrgUnitDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Target parent unit. Omit or null to move to top level.',
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  parentId?: string | null;
}
