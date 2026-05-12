import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { APIError } from 'better-auth/api';
import { ApiEndpointDoc } from '../common/swagger/api-docs.js';
import { successResponse } from '../common/http/api-response.js';
import { CurrentSession } from './decorators/current-session.decorator.js';
import type { RossUserSession } from './auth.types.js';
import { AuthSessionGuard } from './guards/auth-session.guard.js';
import { authApi, buildAuthHeaders } from './auth-api.js';

type AuthMeResponse = {
  success: true;
  data: {
    id: string;
    name: string;
    email: string;
    role: string;
    status: string;
    lastLoginAt: Date | null;
  };
  meta: {
    requestId: string | null;
    signOutEndpoint: string;
  };
};

export const BETTER_AUTH_SIGN_OUT_ENDPOINT = '/api/auth/sign-out';

@Controller('api/v1/auth')
@ApiTags('Auth')
export class AuthController {
  @Get('me')
  @UseGuards(AuthSessionGuard)
  @ApiEndpointDoc({
    summary: 'Get current authenticated user',
    description:
      'Returns current user from a valid Better Auth session. Sign out via POST /api/v1/auth/logout or /api/auth/sign-out.',
    errors: [401],
  })
  getMe(
    @CurrentSession() session: RossUserSession,
    @Req() request: Request,
  ): AuthMeResponse {
    const requestId = request.header('x-request-id') ?? null;

    return {
      success: true,
      data: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        role: session.user.role,
        status: session.user.status,
        lastLoginAt: session.user.lastLoginAt ?? null,
      },
      meta: { requestId, signOutEndpoint: BETTER_AUTH_SIGN_OUT_ENDPOINT },
    };
  }

  @Post('logout')
  @UseGuards(AuthSessionGuard)
  @HttpCode(HttpStatus.OK)
  @ApiEndpointDoc({
    summary: 'Sign out current session',
    description:
      'Delegates to Better Auth sign-out and clears the session cookie for the caller.',
    errors: [401],
  })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    // IMPORTANT: invoke Better Auth with `asResponse: true` so we get a real
    // `Response` object back. Without it, Better Auth writes `Set-Cookie:
    // ross.session_token=; Max-Age=0` into its internal response headers and
    // throws them away — the browser never sees the cookie-clear header and
    // keeps the session, which in turn makes the Next.js proxy bounce users
    // back to /dashboard after "sign out".
    let authResponse: Response_ | null = null;
    try {
      authResponse = await authApi.signOut({
        headers: buildAuthHeaders(request),
        asResponse: true,
      });
    } catch (error) {
      if (!(error instanceof APIError)) throw error;
      // Already signed out (e.g. expired session): fall through and still
      // clear the cookie on our end so the client state converges.
    }

    applySetCookieHeaders(response, authResponse);
    ensureSessionCookieCleared(request, response);

    return successResponse({ success: true });
  }
}

/**
 * Forward every `Set-Cookie` header emitted by Better Auth's fetch-style
 * Response onto the Express response. Better Auth can emit multiple cookies
 * (session_token, session_data, optional chunked variants, dont_remember),
 * so we iterate rather than calling `res.setHeader` once.
 */
function applySetCookieHeaders(
  response: Response,
  authResponse: Response_ | null,
) {
  if (!authResponse) return;
  const headers =
    typeof authResponse.headers?.getSetCookie === 'function'
      ? authResponse.headers.getSetCookie()
      : [];
  for (const cookie of headers) {
    response.append('Set-Cookie', cookie);
  }
}

/**
 * Defensive fallback: if Better Auth somehow did not emit a clear header for
 * `ross.session_token` (different plugin wiring, custom cookie config, etc.)
 * we still wipe the cookie using the same attributes the session was set
 * with. Safe to run even when Better Auth already cleared it — Express will
 * just append a second identical `Set-Cookie` which the browser happily
 * interprets as "delete".
 */
function ensureSessionCookieCleared(request: Request, response: Response) {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader?.includes('ross.session_token=')) return;
  const setCookie = response.getHeader('Set-Cookie');
  const hasClear = Array.isArray(setCookie)
    ? setCookie.some((value) => String(value).startsWith('ross.session_token='))
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

// Local alias so we don't collide with Express's Response import.
type Response_ = globalThis.Response;
