import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { APIError } from 'better-auth/api';
import { AuthSessionGuard, CurrentUser } from '../auth/index.js';
import type { RossUserSession } from '../auth/auth.types.js';
import { successResponse } from '../common/http/api-response.js';
import { ApiEndpointDoc } from '../common/swagger/api-docs.js';
import { authApi, buildAuthHeaders } from '../auth/auth-api.js';
import { ProfileService } from './profile.service.js';
import { ChangePasswordDto, UpdateProfileDto } from './dto/index.js';

@Controller('api/v1/profile')
@UseGuards(AuthSessionGuard)
@ApiTags('Profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  @ApiEndpointDoc({
    summary: 'Get current profile',
    description:
      'Returns the authenticated user with campaign memberships. Role/status are read-only through this endpoint.',
    errors: [401],
  })
  async getProfile(@CurrentUser() user: RossUserSession['user']) {
    const profile = await this.profileService.getProfile(user);
    return successResponse(profile);
  }

  @Patch()
  @ApiEndpointDoc({
    summary: 'Update own profile',
    description:
      'Updates name and image for the current user. Role, status, and email cannot be changed here; use Admin endpoints instead.',
    body: UpdateProfileDto,
    errors: [400, 401],
  })
  async updateProfile(
    @CurrentUser() user: RossUserSession['user'],
    @Body() dto: UpdateProfileDto,
    @Req() request: Request,
  ) {
    const updated = await this.profileService.updateProfile(user, dto, request);
    return successResponse(updated);
  }

  @Patch('password')
  @HttpCode(HttpStatus.OK)
  @ApiEndpointDoc({
    summary: 'Change own password',
    description:
      'Delegates to Better Auth change-password, then signs out the current session. The response includes Set-Cookie headers to clear the session cookie. Client must redirect to login.',
    body: ChangePasswordDto,
    errors: [400, 401],
  })
  async changePassword(
    @CurrentUser() user: RossUserSession['user'],
    @Body() dto: ChangePasswordDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.profileService.changePassword(user, dto, request);

    // Sign out the current session so the cookie is invalidated.
    // Better Auth's `revokeOtherSessions` only revokes *other* sessions;
    // the current session remains active. We must explicitly sign out here
    // so the browser receives a `Set-Cookie: ross.session_token=; Max-Age=0`
    // header and the session row is deleted from the database.
    try {
      const authResponse = await authApi.signOut({
        headers: buildAuthHeaders(request),
        asResponse: true,
      });
      // Forward Set-Cookie headers from Better Auth's response
      if (authResponse) {
        const setCookieHeaders =
          typeof authResponse.headers?.getSetCookie === 'function'
            ? authResponse.headers.getSetCookie()
            : [];
        for (const cookie of setCookieHeaders) {
          response.append('Set-Cookie', cookie);
        }
      }
    } catch (error) {
      // If signOut fails (e.g. session already revoked), still clear cookie
      if (!(error instanceof APIError)) {
        console.warn('[ProfileController] signOut after password change failed', error);
      }
    }

    // Defensive fallback: ensure the cookie is cleared even if Better Auth
    // did not emit the header (same approach as AuthController.logout).
    this.ensureSessionCookieCleared(request, response);

    return successResponse({
      passwordChanged: true,
      sessionRevoked: true,
      requiresLogin: true,
    });
  }

  @Get('sessions')
  @ApiEndpointDoc({
    summary: 'List own sessions',
    description:
      'Returns active Better Auth sessions for the current user. Raw token values are never returned.',
    errors: [401],
  })
  async listSessions(@CurrentUser() user: RossUserSession['user']) {
    const sessions = await this.profileService.listSessions(user);
    return successResponse(sessions);
  }

  /**
   * Defensive cookie clear: if Better Auth did not emit a `Set-Cookie` header
   * for `ross.session_token`, we emit one ourselves with `Max-Age=0`.
   */
  private ensureSessionCookieCleared(request: Request, response: Response) {
    const cookieHeader = request.headers.cookie;
    if (!cookieHeader?.includes('ross.session_token=')) return;
    const setCookie = response.getHeader('Set-Cookie');
    const hasClear = Array.isArray(setCookie)
      ? setCookie.some((v) => String(v).startsWith('ross.session_token='))
      : typeof setCookie === 'string'
        ? setCookie.startsWith('ross.session_token=')
        : false;
    if (hasClear) return;
    response.clearCookie('ross.session_token', {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
  }
}
