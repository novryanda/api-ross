import { ArrayMinSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class AssignCommentCommandDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  assigneeIds!: string[];
}
