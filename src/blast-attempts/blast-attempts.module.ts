import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit-logs/audit-log.module.js';
import { BlastReportsModule } from '../blast-reports/blast-reports.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { BlastAttemptsController } from './blast-attempts.controller.js';
import { BlastAttemptsService } from './blast-attempts.service.js';

@Module({
  imports: [PrismaModule, AuditLogModule, BlastReportsModule],
  controllers: [BlastAttemptsController],
  providers: [BlastAttemptsService],
  exports: [BlastAttemptsService],
})
export class BlastAttemptsModule {}
