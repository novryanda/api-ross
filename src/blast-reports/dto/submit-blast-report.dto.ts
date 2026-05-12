import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
} from 'class-validator';

export class SubmitBlastReportDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  views!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  likes!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  comments!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  shares!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  reposts!: number;

  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  proofLink!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
