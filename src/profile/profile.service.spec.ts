import { BadRequestException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { ProfileService } from './profile.service.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';

type Dict = Record<string, unknown>;

const actor = {
  id: 'user-1',
  name: 'User',
  email: 'user@example.com',
  role: 'BUZZER',
  status: 'ACTIVE',
};

function createPrismaMock() {
  return {
    user: { findUnique: jest.fn() },
    campaignMember: { findMany: jest.fn() },
    session: { findMany: jest.fn() },
  };
}

function fakeRequest(): unknown {
  return {
    ip: '127.0.0.1',
    header: (name: string) =>
      name.toLowerCase() === 'user-agent' ? 'jest' : undefined,
    headers: {},
  };
}

describe('ProfileService.changePassword', () => {
  it('rejects when newPassword equals currentPassword', async () => {
    const service = new ProfileService(
      createPrismaMock() as never,
      { create: jest.fn() } as never,
    );

    const dto: ChangePasswordDto = {
      currentPassword: 'SamePass123',
      newPassword: 'SamePass123',
    };

    await expect(
      service.changePassword(actor as never, dto, fakeRequest() as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
