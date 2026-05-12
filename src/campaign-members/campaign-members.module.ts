import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit-logs/audit-log.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CampaignMembersController } from './campaign-members.controller.js';
import { CampaignMembersService } from './campaign-members.service.js';

@Module({
  imports: [PrismaModule, AuditLogModule],
  controllers: [CampaignMembersController],
  providers: [CampaignMembersService],
  exports: [CampaignMembersService],
})
export class CampaignMembersModule {}
