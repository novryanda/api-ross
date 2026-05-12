import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { RossUserSession } from '../auth.types.js';

@Injectable()
export class AuthSessionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ session?: RossUserSession }>();

    if (!request.session) {
      throw new UnauthorizedException('Authentication is required.');
    }

    return true;
  }
}
