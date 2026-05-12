import { APIError } from 'better-auth/api';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { admin as adminPlugin } from 'better-auth/plugins/admin';
import { UserRole, UserStatus } from '../generated/prisma/client.js';
import { getBetterAuthUrl, getAuthCookieDomain, getTrustedOrigins } from '../config/env.js';
import {
  adminRole,
  buzzerRole,
  rossAccessControl,
  viewerRole,
} from './permissions.js';
import { prisma } from './prisma.js';

export const auth = betterAuth({
  appName: 'ROSS',
  baseURL: getBetterAuthUrl(),
  basePath: '/api/auth',
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  user: {
    additionalFields: {
      status: {
        type: 'string',
        required: false,
        defaultValue: UserStatus.ACTIVE,
        input: true,
      },
      lastLoginAt: {
        type: 'date',
        required: false,
        input: false,
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    requireEmailVerification: false,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
      strategy: 'jwe',
    },
  },
  trustedOrigins: getTrustedOrigins(),
  rateLimit: {
    enabled: true,
    window: 10,
    max: 100,
    customRules: {
      '/sign-in/email': { window: 10, max: 3 },
      '/sign-up/email': false,
    },
  },
  advanced: {
    useSecureCookies: process.env.NODE_ENV === 'production',
    cookiePrefix: 'ross',
    crossSubDomainCookies: getAuthCookieDomain()
      ? { enabled: true, domain: getAuthCookieDomain()! }
      : undefined,
    database: {
      generateId: 'uuid',
    },
  },
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const user = await prisma.user.findUnique({
            where: { id: session.userId },
            select: {
              status: true,
              deletedAt: true,
              banned: true,
            },
          });

          if (
            !user ||
            user.deletedAt ||
            user.status !== UserStatus.ACTIVE ||
            user.banned
          ) {
            throw new APIError('FORBIDDEN', {
              message: 'User is inactive or suspended.',
            });
          }
        },
        after: async (session) => {
          await prisma.user.update({
            where: { id: session.userId },
            data: { lastLoginAt: new Date() },
          });
        },
      },
    },
  },
  plugins: [
    adminPlugin({
      defaultRole: UserRole.BUZZER,
      adminRoles: [UserRole.ADMIN],
      ac: rossAccessControl,
      roles: {
        ADMIN: adminRole,
        BUZZER: buzzerRole,
        VIEWER: viewerRole,
      },
      bannedUserMessage: 'User is inactive or suspended.',
    }),
  ],
});

export type Auth = typeof auth;
