import { jest } from '@jest/globals';
import { AuditLogService } from './audit-log.service.js';
import { AuditAction } from '../generated/prisma/client.js';

describe('AuditLogService', () => {
  function buildPrisma() {
    return {
      auditLog: {
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
      },
      $transaction: jest.fn((ops) => Promise.all(ops)),
    };
  }

  it('findAll returns items + pagination envelope with campaign filter applied', async () => {
    const prisma = buildPrisma();
    prisma.auditLog.findMany.mockResolvedValue([
      {
        id: 'al-1',
        action: AuditAction.EXPORT_REQUESTED,
        actorId: 'u-1',
        campaignId: 'c-1',
        entityType: 'ExportReport',
        entityId: 'exp-1',
        oldValue: null,
        newValue: {},
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
        createdAt: new Date('2026-05-10T00:00:00.000Z'),
        actor: {
          id: 'u-1',
          name: 'Admin',
          email: 'a@example.com',
          role: 'ADMIN',
        },
        campaign: { id: 'c-1', name: 'Campaign', status: 'ACTIVE' },
      },
    ]);
    prisma.auditLog.count.mockResolvedValue(1);

    const service = new AuditLogService(prisma as never);
    const result = await service.findAll(
      {
        page: 1,
        limit: 20,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      } as never,
      'c-1',
    );

    expect(result).toMatchObject({
      items: [
        expect.objectContaining({
          id: 'al-1',
          action: AuditAction.EXPORT_REQUESTED,
          actorName: 'Admin',
          actorEmail: 'a@example.com',
          actorRole: 'ADMIN',
        }),
      ],
      pagination: {
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      },
    });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ campaignId: 'c-1' }),
      }),
    );
  });

  it('findById returns the mapped payload or throws NotFound', async () => {
    const prisma = buildPrisma();
    const service = new AuditLogService(prisma as never);

    prisma.auditLog.findUnique.mockResolvedValueOnce({
      id: 'al-1',
      action: AuditAction.CAMPAIGN_CREATED,
      actorId: 'u-1',
      campaignId: null,
      entityType: 'Campaign',
      entityId: 'c-1',
      oldValue: null,
      newValue: { name: 'x' },
      ipAddress: null,
      userAgent: null,
      createdAt: new Date(),
      actor: {
        id: 'u-1',
        name: 'Admin',
        email: 'a@example.com',
        role: 'ADMIN',
      },
      campaign: null,
    });
    await expect(service.findById('al-1')).resolves.toMatchObject({
      id: 'al-1',
      actorName: 'Admin',
      newValues: { name: 'x' },
    });

    prisma.auditLog.findUnique.mockResolvedValueOnce(null);
    await expect(service.findById('missing')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'NOT_FOUND' }),
    });
  });
});
