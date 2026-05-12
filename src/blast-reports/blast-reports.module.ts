import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { BlastReportsController } from './blast-reports.controller.js';
import { BlastReportsService } from './blast-reports.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [BlastReportsController],
  providers: [BlastReportsService],
  exports: [BlastReportsService],
})
export class BlastReportsModule {}
