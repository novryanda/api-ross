import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import {
  CommentCommandStatus,
  CommentStance,
  Platform,
} from '../../generated/prisma/client.js';

export class CommentCommandQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(CommentStance)
  stance?: CommentStance;

  @IsOptional()
  @IsEnum(Platform)
  platform?: Platform;

  @IsOptional()
  @IsEnum(CommentCommandStatus)
  status?: CommentCommandStatus;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
