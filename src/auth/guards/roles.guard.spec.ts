import { jest } from '@jest/globals';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard.js';
import { UserRole } from '../../generated/prisma/client.js';

function buildContext(role?: UserRole) {
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({
      getRequest: () => ({
        session: role
          ? {
              user: {
                id: '11111111-1111-1111-1111-111111111111',
                role,
              },
            }
          : undefined,
      }),
    }),
  };
}

describe('RolesGuard', () => {
  it('rejects anonymous requests with 401', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([UserRole.ADMIN]),
    };
    const guard = new RolesGuard(reflector as unknown as Reflector);

    expect(() => guard.canActivate(buildContext() as never)).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects authenticated users with wrong role with 403', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([UserRole.ADMIN]),
    };
    const guard = new RolesGuard(reflector as unknown as Reflector);

    expect(() =>
      guard.canActivate(buildContext(UserRole.BUZZER) as never),
    ).toThrow(ForbiddenException);
  });

  it('allows authenticated users with required role', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([UserRole.ADMIN]),
    };
    const guard = new RolesGuard(reflector as unknown as Reflector);

    expect(guard.canActivate(buildContext(UserRole.ADMIN) as never)).toBe(true);
  });
});
