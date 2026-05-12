import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit-logs/audit-log.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SocialAccountsController } from './social-accounts.controller.js';
import { SocialAccountsService } from './social-accounts.service.js';

@Module({
  imports: [PrismaModule, AuditLogModule],
  controllers: [SocialAccountsController],
  providers: [SocialAccountsService],
  exports: [SocialAccountsService],
})
export class SocialAccountsModule {}
