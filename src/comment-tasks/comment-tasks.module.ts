import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CommentTasksController } from './comment-tasks.controller.js';
import { CommentTasksService } from './comment-tasks.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [CommentTasksController],
  providers: [CommentTasksService],
  exports: [CommentTasksService],
})
export class CommentTasksModule {}
