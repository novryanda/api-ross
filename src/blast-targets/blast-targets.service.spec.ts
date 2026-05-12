import { jest } from '@jest/globals';
import { BlastTargetsService } from './blast-targets.service.js';
import {
  AuditAction,
  BlastAttemptStatus,
  BlastTargetStatus,
  CampaignStatus,
  ReviewStatus,
  UserRole,
} from '../generated/prisma/client.js';

const admin = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Admin',
  email: 'admin@example.com',
  role: UserRole.ADMIN,
  status: 'ACTIVE',
};

describe('BlastTargetsService', () => {
  it('creates a reblast attempt with next attemptNo and dedicated audit event', async () => {
    const campaignId = '33333333-3333-3333-3333-333333333333';
    const blastTargetId = '22222222-2222-2222-2222-222222222222';
    const createdAttempt = {
      id: '55555555-5555-5555-5555-555555555555',
      blastTargetId,
      attemptNo: 3,
      status: BlastAttemptStatus.AVAILABLE,
      blastTarget: {
        campaign: { id: campaignId },
        socialAccount: {},
      },
    };
    const prisma = {
      campaign: {
        findFirst: jest.fn().mockResolvedValue({ id: campaignId }),
      },
      blastTarget: {
        findFirst: jest.fn().mockResolvedValue({
          id: blastTargetId,
          status: BlastTargetStatus.ACTIVE,
          reviewStatus: ReviewStatus.APPROVED,
          campaign: {
            id: campaignId,
            deletedAt: null,
            status: CampaignStatus.ACTIVE,
          },
        }),
      },
      blastAttempt: {
        findFirst: jest.fn().mockResolvedValue({ attemptNo: 2 }),
        create: jest.fn().mockResolvedValue(createdAttempt),
        update: jest.fn(),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn((callback) => callback(prisma)),
    };

    const service = new BlastTargetsService(prisma as never, {} as never);

    await service.reblast(admin as never, campaignId, blastTargetId, {
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
    });

    expect(prisma.blastAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          blastTargetId,
          attemptNo: 3,
          status: BlastAttemptStatus.AVAILABLE,
        },
      }),
    );
    expect(prisma.blastAttempt.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: AuditAction.REBLAST_ATTEMPT_CREATED,
          actorId: admin.id,
          campaignId,
          entityId: createdAttempt.id,
          ipAddress: '127.0.0.1',
          userAgent: 'jest',
        }),
      }),
    );
  });
});
