import { jest } from '@jest/globals';
import { CommentCommandsService } from './comment-commands.service.js';
import {
  AuditAction,
  CommentCommandStatus,
  CommentStance,
  CommentTaskStatus,
  Platform,
  UserRole,
} from '../generated/prisma/client.js';

const admin = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Admin',
  email: 'admin@example.com',
  role: UserRole.ADMIN,
  status: 'ACTIVE',
};

function buildCommand(overrides: Record<string, unknown> = {}) {
  const campaignId = '33333333-3333-3333-3333-333333333333';

  return {
    id: '22222222-2222-2222-2222-222222222222',
    campaignId,
    socialAccountId: null,
    targetPostUrl: 'https://example.com/post',
    platform: Platform.TIKTOK,
    stance: CommentStance.PRO,
    narrative: 'Support the campaign',
    instruction: null,
    requiredSlots: 3,
    keepExpiryMinutes: 120,
    deadline: new Date('2026-05-11T10:00:00.000Z'),
    status: CommentCommandStatus.ACTIVE,
    createdById: admin.id,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    campaign: {
      id: campaignId,
      name: 'Campaign',
      status: 'ACTIVE',
      startDate: new Date(),
      endDate: null,
    },
    socialAccount: null,
    createdBy: {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: UserRole.ADMIN,
    },
    _count: { tasks: 3 },
    ...overrides,
  };
}

describe('CommentCommandsService', () => {
  it('creates an ACTIVE command and creates AVAILABLE slots', async () => {
    const command = buildCommand();
    const prisma = {
      campaign: {
        findFirst: jest.fn().mockResolvedValue({ id: command.campaignId }),
      },
      socialAccount: {
        findFirst: jest.fn(),
      },
      commentCommand: {
        create: jest.fn().mockResolvedValue(command),
      },
      commentTask: {
        createMany: jest.fn().mockResolvedValue({ count: 3 }),
        groupBy: jest.fn().mockResolvedValue([
          {
            status: CommentTaskStatus.AVAILABLE,
            _count: { _all: 3 },
          },
        ]),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn((callback) => callback(prisma)),
    };
    const service = new CommentCommandsService(prisma as never);

    const result = await service.create(
      admin as never,
      command.campaignId,
      {
        targetPostUrl: command.targetPostUrl,
        platform: Platform.TIKTOK,
        stance: CommentStance.PRO,
        narrative: command.narrative,
        requiredSlots: 3,
        deadline: '2026-05-11T10:00:00.000Z',
        status: CommentCommandStatus.ACTIVE,
      },
      { ipAddress: '127.0.0.1', userAgent: 'jest' },
    );

    expect(result.slotCounts).toEqual(
      expect.objectContaining({
        requiredSlots: 3,
        availableSlots: 3,
      }),
    );
    expect(prisma.commentTask.createMany).toHaveBeenCalledWith({
      data: [
        {
          commentCommandId: command.id,
          taskNo: 1,
          status: CommentTaskStatus.AVAILABLE,
        },
        {
          commentCommandId: command.id,
          taskNo: 2,
          status: CommentTaskStatus.AVAILABLE,
        },
        {
          commentCommandId: command.id,
          taskNo: 3,
          status: CommentTaskStatus.AVAILABLE,
        },
      ],
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: AuditAction.COMMENT_COMMAND_CREATED,
          actorId: admin.id,
          campaignId: command.campaignId,
          entityId: command.id,
          ipAddress: '127.0.0.1',
          userAgent: 'jest',
        }),
      }),
    );
  });

  it('lists commands with computed slot counts', async () => {
    const command = buildCommand({ _count: { tasks: 3 } });
    const prisma = {
      campaign: {
        findFirst: jest.fn().mockResolvedValue({ id: command.campaignId }),
      },
      commentCommand: {
        findMany: jest.fn().mockResolvedValue([command]),
        count: jest.fn().mockResolvedValue(1),
      },
      commentTask: {
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([
          {
            commentCommandId: command.id,
            status: CommentTaskStatus.AVAILABLE,
            _count: { _all: 1 },
          },
          {
            commentCommandId: command.id,
            status: CommentTaskStatus.KEPT,
            _count: { _all: 1 },
          },
          {
            commentCommandId: command.id,
            status: CommentTaskStatus.COMPLETED,
            _count: { _all: 1 },
          },
        ]),
      },
      $transaction: jest.fn((queries) => Promise.all(queries)),
    };
    const service = new CommentCommandsService(prisma as never);

    const result = await service.findAll(command.campaignId, {
      page: 1,
      limit: 20,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });

    expect(result.items[0].slotCounts).toEqual(
      expect.objectContaining({
        requiredSlots: 3,
        availableSlots: 1,
        keptSlots: 1,
        completedSlots: 1,
      }),
    );
  });
});
