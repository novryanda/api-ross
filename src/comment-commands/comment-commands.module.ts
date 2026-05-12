import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit-logs/audit-log.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CommentCommandsController } from './comment-commands.controller.js';
import { CommentCommandsService } from './comment-commands.service.js';

@Module({
  imports: [PrismaModule, AuditLogModule],
  controllers: [CommentCommandsController],
  providers: [CommentCommandsService],
  exports: [CommentCommandsService],
})
export class CommentCommandsModule {}
