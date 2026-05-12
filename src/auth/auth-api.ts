import type { Request } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from './auth.js';

/**
 * Converts an Express request's headers into the standard Fetch `Headers`
 * object that Better Auth's server API expects. This ensures the current
 * session cookie is forwarded, so endpoints guarded by Better Auth
 * middleware (admin plugin, sessions, change-password, etc.) can resolve
 * the authenticated actor.
 */
export function buildAuthHeaders(request: Request): Headers {
  return fromNodeHeaders(request.headers);
}

/**
 * Typed reference to the Better Auth server API. Use together with
 * `buildAuthHeaders(request)` when calling endpoints that require the
 * current user session.
 */
export const authApi = auth.api;
