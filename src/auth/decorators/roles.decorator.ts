import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '../../generated/prisma/client.js';

export const ROSS_ROLES_KEY = 'ross:roles';

export const Roles = (...roles: UserRole[]) =>
  SetMetadata(ROSS_ROLES_KEY, roles);
