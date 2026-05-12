import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '../../generated/prisma/client.js';
import type { RossUserSession } from '../auth.types.js';
import { ROSS_ROLES_KEY } from '../decorators/roles.decorator.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROSS_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles?.length) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ session?: RossUserSession }>();
    const session = request.session;

    if (!session) {
      throw new UnauthorizedException('Authentication is required.');
    }

    if (!requiredRoles.includes(session.user.role)) {
      throw new ForbiddenException('Insufficient role permission.');
    }

    return true;
  }
}
