import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { RossUserSession } from '../auth.types.js';

export const CurrentSession = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RossUserSession | undefined => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ session?: RossUserSession }>();
    return request.session;
  },
);
