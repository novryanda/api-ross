import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit-logs/audit-log.module.js';
import { BlastAttemptsModule } from '../blast-attempts/blast-attempts.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { BlastTargetsController } from './blast-targets.controller.js';
import { BlastTargetsService } from './blast-targets.service.js';

@Module({
  imports: [PrismaModule, AuditLogModule, BlastAttemptsModule],
  controllers: [BlastTargetsController],
  providers: [BlastTargetsService],
  exports: [BlastTargetsService],
})
export class BlastTargetsModule {}
