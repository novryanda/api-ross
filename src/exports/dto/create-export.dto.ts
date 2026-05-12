import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ExportFormat, ExportScope } from '../../generated/prisma/client.js';

export class CreateExportDto {
  @ApiProperty({
    enum: ExportFormat,
    description:
      'Output format of the generated export artefact. `EXCEL` produces an `.xlsx` file.',
  })
  @IsEnum(ExportFormat)
  format!: ExportFormat;

  @ApiProperty({
    enum: ExportScope,
    required: false,
    default: ExportScope.FULL,
    description:
      'Section of the campaign to include in the snapshot. Defaults to `FULL`.',
  })
  @IsOptional()
  @IsEnum(ExportScope)
  scope?: ExportScope;

  @ApiProperty({
    required: false,
    type: String,
    format: 'date-time',
    description:
      'Optional lower bound applied to `submittedAt` (blast reports) and `completedAt` (comment tasks).',
  })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiProperty({
    required: false,
    type: String,
    format: 'date-time',
    description:
      'Optional upper bound. Must be greater than or equal to `dateFrom` when both are provided.',
  })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
