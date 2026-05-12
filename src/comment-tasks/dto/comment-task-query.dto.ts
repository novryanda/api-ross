import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import {
  CommentStance,
  CommentTaskStatus,
  Platform,
} from '../../generated/prisma/client.js';

export class CommentTaskQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(CommentTaskStatus)
  status?: CommentTaskStatus;

  @IsOptional()
  @IsUUID()
  keptBy?: string;

  @IsOptional()
  @IsUUID()
  commandId?: string;

  @IsOptional()
  @IsEnum(CommentStance)
  stance?: CommentStance;

  @IsOptional()
  @IsEnum(Platform)
  platform?: Platform;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

export class BuzzerCommentQueueQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(Platform)
  platform?: Platform;

  @IsOptional()
  @IsEnum(CommentStance)
  stance?: CommentStance;
}
