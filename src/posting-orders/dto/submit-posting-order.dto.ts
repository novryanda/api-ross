import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class SubmitPostingOrderDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  socialAccountId!: string;

  @ApiProperty({ format: 'uri' })
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  postedUrl!: string;

  @ApiProperty({ format: 'uri' })
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  proofDriveUrl!: string;

  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;
}
