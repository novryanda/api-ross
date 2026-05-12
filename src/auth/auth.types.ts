import type { UserSession } from '@thallesp/nestjs-better-auth';
import type { UserRole, UserStatus } from '../generated/prisma/client.js';
import type { Auth } from './auth.js';

export type RossUserSession = UserSession<Auth> & {
  user: UserSession<Auth>['user'] & {
    role: UserRole;
    status: UserStatus;
    lastLoginAt?: Date | null;
  };
};

export const ROSS_ROLES = ['ADMIN', 'BUZZER', 'VIEWER'] as const;
export type RossRole = (typeof ROSS_ROLES)[number];
