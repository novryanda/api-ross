import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { jest } from '@jest/globals';
import { UserRole, UserStatus } from '../generated/prisma/client.js';
import { UsersService } from './users.service.js';
import { ListUsersQueryDto } from './dto/user-query.dto.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UpdateUserStatusDto } from './dto/update-user-status.dto.js';

type Dict = Record<string, unknown>;

const adminActor = {
  id: 'admin-1',
  name: 'Admin',
  email: 'admin@example.com',
  role: UserRole.ADMIN,
  status: UserStatus.ACTIVE,
};

function buildUser(overrides: Partial<Dict> = {}): Dict {
  return {
    id: 'user-1',
    name: 'User One',
    email: 'user1@example.com',
    image: null,
    role: UserRole.BUZZER,
    status: UserStatus.ACTIVE,
    lastLoginAt: null,
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    updatedAt: new Date('2026-05-01T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

function createPrismaMock() {
  const prisma: Dict = {};
  prisma.$transaction = jest.fn(async (arg: unknown) => {
    if (typeof arg === 'function') {
      return (arg as (tx: Dict) => unknown)(prisma);
    }
    if (Array.isArray(arg)) {
      return Promise.all(arg);
    }
    return arg;
  });
  prisma.user = {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  prisma.account = {
    upsert: jest.fn(),
    create: jest.fn(),
  };
  prisma.session = {
    deleteMany: jest.fn(),
  };
  prisma.campaign = {
    count: jest.fn(),
  };
  prisma.campaignMember = {
    createMany: jest.fn(),
  };
  prisma.auditLog = {
    create: jest.fn(),
  };
  prisma.blastAttempt = {
    count: jest.fn(),
    findFirst: jest.fn(),
  };
  prisma.commentTask = {
    count: jest.fn(),
    findFirst: jest.fn(),
  };
  prisma.blastReport = {
    count: jest.fn(),
    findFirst: jest.fn(),
  };
  return prisma;
}

function createAuditLogsMock() {
  return {
    create: jest.fn(),
  };
}

describe('UsersService', () => {
  let prisma: Dict;
  let auditLogs: { create: jest.Mock };
  let service: UsersService;

  beforeEach(() => {
    prisma = createPrismaMock();
    auditLogs = createAuditLogsMock();
    service = new UsersService(prisma as never, auditLogs as never);
  });

  describe('findAll', () => {
    it('returns paginated users with campaignCount derived from _count', async () => {
      (prisma.user as Dict).findMany = jest.fn().mockResolvedValue([
        {
          ...buildUser(),
          _count: { campaignMemberships: 3 },
        },
      ]);
      (prisma.user as Dict).count = jest.fn().mockResolvedValue(1);

      const query = new ListUsersQueryDto();
      const result = await service.findAll(query);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].campaignCount).toBe(3);
      expect(result.meta).toEqual({
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      });
    });
  });

  describe('create', () => {
    it('rejects duplicate email', async () => {
      (prisma.user as Dict).findUnique = jest
        .fn()
        .mockResolvedValue({ id: 'existing', deletedAt: null });

      const dto: CreateUserDto = {
        name: 'New User',
        email: 'existing@example.com',
        role: UserRole.BUZZER,
      };

      await expect(
        service.create(adminActor as never, dto),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates a Buzzer and memberships when valid', async () => {
      (prisma.user as Dict).findUnique = jest.fn().mockResolvedValue(null);
      (prisma.campaign as Dict).count = jest.fn().mockResolvedValue(1);
      (prisma.user as Dict).create = jest
        .fn()
        .mockResolvedValue(
          buildUser({ id: 'user-new', email: 'new@example.com' }),
        );

      const dto: CreateUserDto = {
        name: 'New User',
        email: 'new@example.com',
        role: UserRole.BUZZER,
        campaignIds: ['10000000-0000-4000-8000-000000000001'],
      };

      const result = await service.create(adminActor as never, dto);

      expect(result.email).toBe('new@example.com');
      expect((prisma.campaignMember as Dict).createMany).toHaveBeenCalled();
      expect((prisma.auditLog as Dict).create).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('rejects empty payload', async () => {
      await expect(
        service.update(adminActor as never, 'user-1', {}),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('blocks demoting the last active admin', async () => {
      (prisma.user as Dict).findFirst = jest
        .fn()
        .mockResolvedValue(
          buildUser({ role: UserRole.ADMIN, status: UserStatus.ACTIVE }),
        );
      (prisma.user as Dict).count = jest.fn().mockResolvedValue(0);

      await expect(
        service.update(adminActor as never, 'user-1', {
          role: UserRole.BUZZER,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('updateStatus', () => {
    it('refuses self-deactivation', async () => {
      (prisma.user as Dict).findFirst = jest
        .fn()
        .mockResolvedValue(
          buildUser({ id: adminActor.id, role: UserRole.ADMIN }),
        );

      await expect(
        service.updateStatus(adminActor as never, adminActor.id, {
          status: UserStatus.INACTIVE,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses deactivating the last active admin', async () => {
      (prisma.user as Dict).findFirst = jest.fn().mockResolvedValue(
        buildUser({
          id: 'user-admin-target',
          role: UserRole.ADMIN,
          status: UserStatus.ACTIVE,
        }),
      );
      (prisma.user as Dict).count = jest.fn().mockResolvedValue(0);

      await expect(
        service.updateStatus(adminActor as never, 'user-admin-target', {
          status: UserStatus.INACTIVE,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException for missing user', async () => {
      (prisma.user as Dict).findFirst = jest.fn().mockResolvedValue(null);

      await expect(service.findOne('unknown')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
