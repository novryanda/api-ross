import { IsString, MaxLength, MinLength } from 'class-validator';

export class BlockCommentTaskDto {
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason!: string;
}
