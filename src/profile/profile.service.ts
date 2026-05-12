import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { APIError } from 'better-auth/api';
import type { Request } from 'express';
import { AuditAction } from '../generated/prisma/client.js';
import { authApi, buildAuthHeaders } from '../auth/auth-api.js';
import type { RossUserSession } from '../auth/auth.types.js';
import { toAuditJson } from '../common/utils/audit-json.js';
import { getRequestAuditContext } from '../common/utils/request-audit-context.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditLogService } from '../audit-logs/audit-log.service.js';
import { ChangePasswordDto, UpdateProfileDto } from './dto/index.js';

type CurrentUser = RossUserSession['user'];

const PROFILE_SUMMARY_SELECT = {
  id: true,
  name: true,
  email: true,
  image: true,
  role: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogService,
  ) {}

  async getProfile(user: CurrentUser) {
    const profile = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: PROFILE_SUMMARY_SELECT,
    });

    if (!profile) {
      throw new InternalServerErrorException({
        code: 'PROFILE_NOT_FOUND',
        message: 'Authenticated user profile was not found.',
        details: [],
      });
    }

    const memberships = await this.prisma.campaignMember.findMany({
      where: {
        userId: user.id,
        campaign: { deletedAt: null },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        memberRole: true,
        createdAt: true,
        campaign: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
      },
    });

    return {
      ...profile,
      campaignMemberships: memberships,
      campaignCount: memberships.length,
    };
  }

  async updateProfile(
    user: CurrentUser,
    dto: UpdateProfileDto,
    request: Request,
  ) {
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'At least one field must be provided.',
        details: [],
      });
    }

    const current = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: PROFILE_SUMMARY_SELECT,
    });

    if (!current) {
      throw new InternalServerErrorException({
        code: 'PROFILE_NOT_FOUND',
        message: 'Authenticated user profile was not found.',
        details: [],
      });
    }

    // Delegate actual write to Better Auth so its data hooks + additional
    // field validation run. Role, status, and email are intentionally NOT
    // part of the payload; users cannot change those about themselves.
    try {
      await authApi.updateUser({
        body: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.image !== undefined ? { image: dto.image } : {}),
        },
        headers: buildAuthHeaders(request),
      });
    } catch (error) {
      this.rethrowBetterAuthError(error, 'Profile update failed.');
    }

    const updated = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: PROFILE_SUMMARY_SELECT,
    });

    const auditContext = getRequestAuditContext(request);
    await this.auditLogs.create({
      actorId: user.id,
      action: AuditAction.PROFILE_UPDATED,
      entityType: 'User',
      entityId: user.id,
      oldValue: toAuditJson(current),
      newValue: toAuditJson(updated),
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
    });

    return updated;
  }

  async changePassword(
    user: CurrentUser,
    dto: ChangePasswordDto,
    request: Request,
  ) {
    // confirmPassword validation is handled on the frontend before the API
    // call. The DTO intentionally omits it because Better Auth's endpoint
    // only accepts currentPassword + newPassword + revokeOtherSessions.

    if (dto.newPassword === dto.currentPassword) {
      throw new BadRequestException({
        code: 'PASSWORD_UNCHANGED',
        message: 'New password must be different from the current password.',
        details: [
          {
            field: 'newPassword',
            message: 'Must differ from currentPassword.',
          },
        ],
      });
    }

    try {
      await authApi.changePassword({
        body: {
          currentPassword: dto.currentPassword,
          newPassword: dto.newPassword,
          revokeOtherSessions: dto.revokeOtherSessions ?? true,
        },
        headers: buildAuthHeaders(request),
      });
    } catch (error) {
      this.rethrowBetterAuthError(error, 'Password change failed.');
    }

    const auditContext = getRequestAuditContext(request);
    await this.auditLogs.create({
      actorId: user.id,
      action: AuditAction.PASSWORD_CHANGED,
      entityType: 'User',
      entityId: user.id,
      newValue: toAuditJson({
        revokeOtherSessions: dto.revokeOtherSessions ?? true,
      }),
      ipAddress: auditContext.ipAddress,
      userAgent: auditContext.userAgent,
    });

    return { success: true };
  }

  async listSessions(user: CurrentUser) {
    const sessions = await this.prisma.session.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        token: true,
        ipAddress: true,
        userAgent: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
        impersonatedBy: true,
      },
    });

    return sessions.map((session) => ({
      id: session.id,
      // Token is sensitive: never return the raw value. Hash-friendly
      // fingerprint (last 8 chars) is enough for UI to identify a row.
      tokenFingerprint: session.token.slice(-8),
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      impersonated: Boolean(session.impersonatedBy),
    }));
  }

  async signOut(request: Request) {
    try {
      await authApi.signOut({ headers: buildAuthHeaders(request) });
    } catch (error) {
      this.rethrowBetterAuthError(error, 'Sign out failed.');
    }

    return { success: true };
  }

  private rethrowBetterAuthError(
    error: unknown,
    fallbackMessage: string,
  ): never {
    if (error instanceof APIError) {
      const status = this.resolveStatusCode(error.status);
      const message = error.body?.message ?? error.message ?? fallbackMessage;
      const code = error.body?.code ?? this.statusToCode(status);
      const body = { code, message, details: [] };
      if (status === 401) throw new UnauthorizedException(body);
      if (status === 403) throw new ForbiddenException(body);
      if (status === 404) throw new NotFoundException(body);
      throw new BadRequestException(body);
    }

    throw error;
  }

  private resolveStatusCode(status: unknown): number {
    if (typeof status === 'number') return status;
    if (typeof status === 'string') {
      if (status === 'UNAUTHORIZED') return 401;
      if (status === 'FORBIDDEN') return 403;
      if (status === 'NOT_FOUND') return 404;
      if (status === 'CONFLICT') return 409;
      return 400;
    }
    return 400;
  }

  private statusToCode(status: number): string {
    switch (status) {
      case 401:
        return 'UNAUTHORIZED';
      case 403:
        return 'FORBIDDEN';
      case 404:
        return 'NOT_FOUND';
      case 409:
        return 'CONFLICT';
      default:
        return 'VALIDATION_ERROR';
    }
  }
}
