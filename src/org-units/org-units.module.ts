import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit-logs/audit-log.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { OrgUnitsController } from './org-units.controller.js';
import { OrgUnitsService } from './org-units.service.js';

@Module({
  imports: [PrismaModule, AuditLogModule],
  controllers: [OrgUnitsController],
  providers: [OrgUnitsService],
  exports: [OrgUnitsService],
})
export class OrgUnitsModule {}
