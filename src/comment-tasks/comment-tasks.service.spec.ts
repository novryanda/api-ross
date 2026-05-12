/* eslint-disable prettier/prettier */
import { describe, expect, it, jest } from '@jest/globals';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { validate } from 'class-validator';
import { CommentTasksService } from './comment-tasks.service.js';
import { CompleteCommentTaskDto } from './dto/index.js';
import {
  AuditAction,
  CampaignStatus,
  CommentCommandStatus,
  CommentStance,
  CommentTaskStatus,
  Platform,
  UserRole,
} from '../generated/prisma/client.js';

const buzzer = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Buzzer',
  email: 'buzzer@example.com',
  role: UserRole.BUZZER,
  status: 'ACTIVE',
};

const otherBuzzer = {
  id: '99999999-9999-9999-9999-999999999999',
  name: 'Other Buzzer',
  email: 'other@example.com',
  role: UserRole.BUZZER,
  status: 'ACTIVE',
};

function buildTask(status: CommentTaskStatus, keptById: string | null = buzzer.id) {
  return {
    id: '22222222-2222-2222-2222-222222222222',
    commentCommandId: '33333333-3333-3333-3333-333333333333',
    taskNo: 1,
    status,
    keptById,
    keptAt: keptById ? new Date() : null,
    keepExpiresAt: keptById
      ? new Date(Date.now() + 120 * 60 * 1000)
      : null,
    completedAt: null,
    proofLink: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    keptBy: keptById
      ? {
          id: keptById,
          name: 'Buzzer',
          email: 'buzzer@example.com',
          role: UserRole.BUZZER,
        }
      : null,
    command: {
      id: '33333333-3333-3333-3333-333333333333',
      campaignId: '55555555-5555-5555-5555-555555555555',
      targetPostUrl: 'https://example.com/post',
      platform: Platform.TIKTOK,
      socialAccountId: null,
      stance: CommentStance.PRO,
      narrative: 'Support the campaign',
      instruction: null,
      requiredSlots: 3,
      keepExpiryMinutes: 120,
      deadline: new Date('2026-05-11T10:00:00.000Z'),
      status: CommentCommandStatus.ACTIVE,
      deletedAt: null,
      campaign: {
        id: '55555555-5555-5555-5555-555555555555',
        name: 'Campaign',
        status: CampaignStatus.ACTIVE,
        startDate: new Date(),
        endDate: null,
        deletedAt: null,
      },
      socialAccount: null,
    },
  };
}

describe('CommentTasksService', () => {
  it('keeps an available task atomically and writes audit log', async () => {
    const task = buildTask(CommentTaskStatus.AVAILABLE, null);
    const keptTask = {
      ...task,
      status: CommentTaskStatus.KEPT,
      keptById: buzzer.id,
      keptAt: new Date(),
      keepExpiresAt: new Date(Date.now() + 120 * 60 * 1000),
      keptBy: {
        id: buzzer.id,
        name: buzzer.name,
        email: buzzer.email,
        role: UserRole.BUZZER,
      },
    };
    const prisma = {
      commentTask: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(task),
        findUniqueOrThrow: jest.fn().mockResolvedValue(keptTask),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      campaignMember: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'member-id',
          campaign: { deletedAt: null },
        }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn((callback) => callback(prisma)),
    };
    const service = new CommentTasksService(prisma as never);

    const result = await service.keep(
      buzzer as never,
      task.id,
      undefined,
      { ipAddress: '127.0.0.1', userAgent: 'jest' },
    );

    expect(result.status).toBe(CommentTaskStatus.KEPT);
    expect(prisma.commentTask.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: task.id,
          status: CommentTaskStatus.AVAILABLE,
        }),
        data: expect.objectContaining({
          status: CommentTaskStatus.KEPT,
          keptById: buzzer.id,
        }),
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: AuditAction.COMMENT_TASK_KEPT,
          actorId: buzzer.id,
          campaignId: task.command.campaignId,
        }),
      }),
    );
  });

  it('allows only one concurrent keep winner for the same task', async () => {
    const task = buildTask(CommentTaskStatus.AVAILABLE, null);
    const keptTask = {
      ...task,
      status: CommentTaskStatus.KEPT,
      keptById: buzzer.id,
      keptAt: new Date(),
      keepExpiresAt: new Date(Date.now() + 120 * 60 * 1000),
    };
    const prisma = {
      commentTask: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn((args: { select?: unknown }) =>
          args.select
            ? Promise.resolve({
                status: CommentTaskStatus.KEPT,
                keptById: buzzer.id,
                command: {
                  status: CommentCommandStatus.ACTIVE,
                  deletedAt: null,
                  campaign: { deletedAt: null },
                },
              })
            : Promise.resolve(task),
        ),
        findUniqueOrThrow: jest.fn().mockResolvedValue(keptTask),
        updateMany: jest
          .fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 0 }),
      },
      campaignMember: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'member-id',
          campaign: { deletedAt: null },
        }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn((callback) => callback(prisma)),
    };
    const service = new CommentTasksService(prisma as never);

    await expect(service.keep(buzzer as never, task.id)).resolves.toEqual(
      expect.objectContaining({ status: CommentTaskStatus.KEPT }),
    );
    await expect(service.keep(otherBuzzer as never, task.id)).rejects.toThrow(
      ConflictException,
    );
  });

  it('rejects completing a task kept by another buzzer', async () => {
    const task = buildTask(CommentTaskStatus.KEPT, otherBuzzer.id);
    const prisma = {
      commentTask: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(task),
      },
    };
    const service = new CommentTasksService(prisma as never);

    await expect(
      service.complete(buzzer as never, task.id, {
        proofLink: 'https://drive.google.com/file/d/example',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('completes an own kept task with proofLink and writes audit log', async () => {
    const task = buildTask(CommentTaskStatus.KEPT);
    const completedTask = {
      ...task,
      status: CommentTaskStatus.COMPLETED,
      proofLink: 'https://drive.google.com/file/d/example',
      notes: 'Done',
      completedAt: new Date(),
    };
    const prisma = {
      commentTask: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(task),
        findUniqueOrThrow: jest.fn().mockResolvedValue(completedTask),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn((callback) => callback(prisma)),
    };
    const service = new CommentTasksService(prisma as never);

    const result = await service.complete(
      buzzer as never,
      task.id,
      {
        proofLink: 'https://drive.google.com/file/d/example',
        notes: 'Done',
      },
      { ipAddress: '127.0.0.1', userAgent: 'jest' },
    );

    expect(result.status).toBe(CommentTaskStatus.COMPLETED);
    expect(prisma.commentTask.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: task.id,
          keptById: buzzer.id,
          status: {
            in: [CommentTaskStatus.KEPT, CommentTaskStatus.IN_PROGRESS],
          },
        },
        data: expect.objectContaining({
          status: CommentTaskStatus.COMPLETED,
          proofLink: 'https://drive.google.com/file/d/example',
          notes: 'Done',
        }),
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: AuditAction.COMMENT_TASK_COMPLETED,
          actorId: buzzer.id,
          campaignId: task.command.campaignId,
        }),
      }),
    );
  });

  it('filters buzzer task lists to the current user only', async () => {
    const prisma = {
      commentTask: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn((queries) => Promise.all(queries)),
    };
    const service = new CommentTasksService(prisma as never);

    await service.findForBuzzer(buzzer as never, {
      page: 1,
      limit: 20,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });

    expect(prisma.commentTask.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          keptById: buzzer.id,
        }),
      }),
    );
  });

  it('requires proofLink to complete a comment task', async () => {
    const dto = new CompleteCommentTaskDto();
    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'proofLink')).toBe(true);
  });
});
