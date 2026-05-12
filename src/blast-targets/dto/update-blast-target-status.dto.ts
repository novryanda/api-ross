import { IsEnum } from 'class-validator';
import { BlastTargetStatus } from '../../generated/prisma/client.js';

export class UpdateBlastTargetStatusDto {
  @IsEnum(BlastTargetStatus)
  status!: BlastTargetStatus;
}
