import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ExportsController } from './exports.controller.js';
import { ExportsService } from './exports.service.js';
import { ExportSnapshotLoader } from './generators/snapshot-loader.js';

@Module({
  imports: [PrismaModule],
  controllers: [ExportsController],
  providers: [ExportsService, ExportSnapshotLoader],
  exports: [ExportsService],
})
export class ExportsModule {}
