import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { UserStatus } from '../../generated/prisma/client.js';

export class UpdateUserStatusDto {
  @ApiProperty({ enum: UserStatus, example: UserStatus.INACTIVE })
  @IsEnum(UserStatus)
  status!: UserStatus;
}
