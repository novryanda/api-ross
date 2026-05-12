import {
  AuthController,
  BETTER_AUTH_SIGN_OUT_ENDPOINT,
} from './auth.controller.js';
import { UserRole, UserStatus } from '../generated/prisma/client.js';

describe('AuthController', () => {
  it('returns the current user from the request session', () => {
    const controller = new AuthController();
    const session = {
      user: {
        id: '11111111-1111-1111-1111-111111111111',
        name: 'Admin',
        email: 'admin@example.com',
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        lastLoginAt: new Date('2026-05-10T00:00:00.000Z'),
      },
    };
    const request = {
      header: (name: string) => (name === 'x-request-id' ? 'req-1' : undefined),
    };

    const result = controller.getMe(session as never, request as never);

    expect(result).toEqual({
      success: true,
      data: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        lastLoginAt: session.user.lastLoginAt,
      },
      meta: {
        requestId: 'req-1',
        signOutEndpoint: BETTER_AUTH_SIGN_OUT_ENDPOINT,
      },
    });
  });
});
