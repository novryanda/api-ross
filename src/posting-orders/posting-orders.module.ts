import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit-logs/audit-log.module.js';
import { OrgUnitsModule } from '../org-units/org-units.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PostingOrdersController } from './posting-orders.controller.js';
import { PostingOrdersService } from './posting-orders.service.js';

@Module({
  imports: [PrismaModule, AuditLogModule, OrgUnitsModule],
  controllers: [PostingOrdersController],
  providers: [PostingOrdersService],
  exports: [PostingOrdersService],
})
export class PostingOrdersModule {}
