import type { Request } from 'express';

export type RequestAuditContext = {
  ipAddress?: string;
  userAgent?: string;
};

export function getRequestAuditContext(request: Request): RequestAuditContext {
  return {
    ipAddress: request.ip,
    userAgent: request.header('user-agent'),
  };
}
