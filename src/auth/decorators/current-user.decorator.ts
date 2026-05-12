import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { RossUserSession } from '../auth.types.js';

export const CurrentUser = createParamDecorator(
  (
    _data: unknown,
    ctx: ExecutionContext,
  ): RossUserSession['user'] | undefined => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ session?: RossUserSession }>();

    return request.session?.user;
  },
);
