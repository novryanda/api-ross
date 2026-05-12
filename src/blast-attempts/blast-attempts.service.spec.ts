import { jest } from '@jest/globals';
import { ConflictException } from '@nestjs/common';
import { BlastAttemptsService } from './blast-attempts.service.js';
import {
  AuditAction,
  BlastAttemptStatus,
  BlastTargetStatus,
  CampaignStatus,
  ReviewStatus,
  UserRole,
} from '../generated/prisma/client.js';

const buzzer = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Buzzer',
  email: 'buzzer@example.com',
  role: UserRole.BUZZER,
  status: 'ACTIVE',
};

describe('BlastAttemptsService', () => {
  it('keeps an attempt with an atomic AVAILABLE -> KEPT update and audit log', async () => {
    const attempt = {
      id: '22222222-2222-2222-2222-222222222222',
      status: BlastAttemptStatus.AVAILABLE,
      keptById: null,
      blastTarget: {
        campaignId: '33333333-3333-3333-3333-333333333333',
        deletedAt: null,
        status: BlastTargetStatus.ACTIVE,
        reviewStatus: ReviewStatus.APPROVED,
        campaign: {
          deletedAt: null,
          status: CampaignStatus.ACTIVE,
        },
        socialAccount: {},
      },
    };
    const keptAttempt = {
      ...attempt,
      status: BlastAttemptStatus.KEPT,
      keptById: buzzer.id,
    };
    const prisma = {
      blastAttempt: {
        findUnique: jest.fn().mockResolvedValue(attempt),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(keptAttempt),
      },
      campaignMember: {
        findUnique: jest.fn().mockResolvedValue({
          id: '44444444-4444-4444-4444-444444444444',
          campaign: { deletedAt: null },
        }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn((callback) => callback(prisma)),
    };

    const service = new BlastAttemptsService(prisma as never, {} as never);

    await service.keep(buzzer as never, attempt.id, undefined, {
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
    });

    expect(prisma.blastAttempt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: attempt.id,
          status: BlastAttemptStatus.AVAILABLE,
          blastTarget: expect.objectContaining({
            status: BlastTargetStatus.ACTIVE,
            reviewStatus: ReviewStatus.APPROVED,
            campaign: expect.objectContaining({
              status: CampaignStatus.ACTIVE,
            }),
          }),
        }),
        data: expect.objectContaining({
          status: BlastAttemptStatus.KEPT,
          keptById: buzzer.id,
        }),
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: AuditAction.BLAST_ATTEMPT_KEPT,
          actorId: buzzer.id,
          campaignId: attempt.blastTarget.campaignId,
          entityId: attempt.id,
          ipAddress: '127.0.0.1',
          userAgent: 'jest',
        }),
      }),
    );
  });

  it('rejects a second buzzer when the attempt was already kept during the race', async () => {
    const attempt = {
      id: '22222222-2222-2222-2222-222222222222',
      status: BlastAttemptStatus.AVAILABLE,
      keptById: null,
      blastTarget: {
        campaignId: '33333333-3333-3333-3333-333333333333',
        deletedAt: null,
        status: BlastTargetStatus.ACTIVE,
        reviewStatus: ReviewStatus.APPROVED,
        campaign: {
          deletedAt: null,
          status: CampaignStatus.ACTIVE,
        },
        socialAccount: {},
      },
    };
    const prisma = {
      blastAttempt: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(attempt)
          .mockResolvedValueOnce({
            status: BlastAttemptStatus.KEPT,
            keptById: '99999999-9999-9999-9999-999999999999',
            blastTarget: {
              deletedAt: null,
              status: BlastTargetStatus.ACTIVE,
              reviewStatus: ReviewStatus.APPROVED,
              campaign: {
                deletedAt: null,
                status: CampaignStatus.ACTIVE,
              },
            },
          }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUniqueOrThrow: jest.fn(),
      },
      campaignMember: {
        findUnique: jest.fn().mockResolvedValue({
          id: '44444444-4444-4444-4444-444444444444',
          campaign: { deletedAt: null },
        }),
      },
      auditLog: {
        create: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(prisma)),
    };

    const service = new BlastAttemptsService(prisma as never, {} as never);

    let caught: unknown;
    try {
      await service.keep(buzzer as never, attempt.id);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ConflictException);
    expect(caught).toMatchObject({
      response: expect.objectContaining({
        code: 'ATTEMPT_ALREADY_KEPT',
      }),
    });
    expect(prisma.blastAttempt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: attempt.id,
          status: BlastAttemptStatus.AVAILABLE,
        }),
      }),
    );
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});
