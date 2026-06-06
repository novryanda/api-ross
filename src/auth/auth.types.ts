import type { UserSession } from '@thallesp/nestjs-better-auth';
import type { UserRole, UserStatus } from '../generated/prisma/client.js';
import type { Auth } from './auth.js';

export type RossUserSession = UserSession<Auth> & {
  user: UserSession<Auth>['user'] & {
    role: UserRole;
    status: UserStatus;
    picUnitId?: string | null;
    lastLoginAt?: Date | null;
  };
};

export const ROSS_ROLES = ['ADMIN', 'BUZZER', 'PIC', 'VIEWER'] as const;
export type RossRole = (typeof ROSS_ROLES)[number];
