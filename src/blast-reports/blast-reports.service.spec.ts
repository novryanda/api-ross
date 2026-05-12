import { jest } from '@jest/globals';
import { ForbiddenException } from '@nestjs/common';
import { BlastReportsService } from './blast-reports.service.js';
import {
  AuditAction,
  BlastAttemptStatus,
  UserRole,
} from '../generated/prisma/client.js';

const buzzer = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Buzzer',
  email: 'buzzer@example.com',
  role: UserRole.BUZZER,
  status: 'ACTIVE',
};

describe('BlastReportsService', () => {
  it('submits report transactionally and completes the kept attempt', async () => {
    const campaignId = '33333333-3333-3333-3333-333333333333';
    const attempt = {
      id: '22222222-2222-2222-2222-222222222222',
      status: BlastAttemptStatus.KEPT,
      keptById: buzzer.id,
      keepExpiresAt: new Date(Date.now() + 60_000),
      report: null,
      blastTarget: {
        campaignId,
        deletedAt: null,
        campaign: {
          deletedAt: null,
        },
      },
    };
    const report = {
      id: '55555555-5555-5555-5555-555555555555',
      blastAttemptId: attempt.id,
      submittedById: buzzer.id,
    };
    const prisma = {
      blastAttempt: {
        findUnique: jest.fn().mockResolvedValue(attempt),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          ...attempt,
          status: BlastAttemptStatus.COMPLETED,
        }),
      },
      campaignMember: {
        findUnique: jest.fn().mockResolvedValue({
          id: '44444444-4444-4444-4444-444444444444',
          campaign: { deletedAt: null },
        }),
      },
      blastReport: {
        create: jest.fn().mockResolvedValue(report),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn((callback) => callback(prisma)),
    };

    const service = new BlastReportsService(prisma as never);

    await service.submitReport(
      buzzer as never,
      attempt.id,
      {
        views: 10,
        likes: 2,
        comments: 1,
        shares: 0,
        reposts: 0,
        proofLink: 'https://example.com/proof',
      },
      { ipAddress: '127.0.0.1', userAgent: 'jest' },
    );

    expect(prisma.blastReport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          blastAttemptId: attempt.id,
          submittedById: buzzer.id,
        }),
      }),
    );
    expect(prisma.blastAttempt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: attempt.id,
          status: BlastAttemptStatus.KEPT,
          keptById: buzzer.id,
        },
        data: expect.objectContaining({
          status: BlastAttemptStatus.COMPLETED,
        }),
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: AuditAction.BLAST_REPORT_SUBMITTED,
          actorId: buzzer.id,
          campaignId,
          entityId: report.id,
          ipAddress: '127.0.0.1',
          userAgent: 'jest',
        }),
      }),
    );
  });

  it('rejects report submission when the attempt is kept by another buzzer', async () => {
    const campaignId = '33333333-3333-3333-3333-333333333333';
    const attempt = {
      id: '22222222-2222-2222-2222-222222222222',
      status: BlastAttemptStatus.KEPT,
      keptById: '99999999-9999-9999-9999-999999999999',
      keepExpiresAt: new Date(Date.now() + 60_000),
      report: null,
      blastTarget: {
        campaignId,
        deletedAt: null,
        campaign: {
          deletedAt: null,
        },
      },
    };
    const prisma = {
      blastAttempt: {
        findUnique: jest.fn().mockResolvedValue(attempt),
      },
      campaignMember: {
        findUnique: jest.fn().mockResolvedValue({
          id: '44444444-4444-4444-4444-444444444444',
          campaign: { deletedAt: null },
        }),
      },
      blastReport: {
        create: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const service = new BlastReportsService(prisma as never);

    await expect(
      service.submitReport(buzzer as never, attempt.id, {
        views: 10,
        likes: 2,
        comments: 1,
        shares: 0,
        reposts: 0,
        proofLink: 'https://example.com/proof',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.blastReport.create).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});
