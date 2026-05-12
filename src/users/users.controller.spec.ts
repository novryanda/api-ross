import { ROSS_ROLES_KEY } from '../auth/decorators/roles.decorator.js';
import { UserRole } from '../generated/prisma/client.js';
import { UsersController } from './users.controller.js';

function rolesFor(controller: object, methodName: string): UserRole[] {
  const handler = Object.getPrototypeOf(controller)[methodName];
  return Reflect.getMetadata(ROSS_ROLES_KEY, handler) as UserRole[];
}

describe('UsersController RBAC metadata', () => {
  const controller = new UsersController({} as never);

  it('restricts every endpoint to ADMIN (buzzer/viewer cannot access)', () => {
    const methods = [
      'findAll',
      'create',
      'findOne',
      'update',
      'updateStatus',
      'resetPassword',
      'getActivitySummary',
    ];

    for (const methodName of methods) {
      expect(rolesFor(controller, methodName)).toEqual([UserRole.ADMIN]);
    }
  });
});
