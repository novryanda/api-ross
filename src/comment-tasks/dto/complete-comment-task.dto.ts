import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class CompleteCommentTaskDto {
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  proofLink!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
