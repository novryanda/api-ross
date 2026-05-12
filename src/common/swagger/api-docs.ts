import { applyDecorators, Type } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { UserRole } from '../../generated/prisma/client.js';

type ApiDocOptions = {
  summary: string;
  description?: string;
  deprecated?: boolean;
  roles?: UserRole[];
  body?: Type<unknown>;
  query?: Type<unknown>;
  queryParams?: string[];
  responseDescription?: string;
  errors?: Array<400 | 401 | 403 | 404 | 409>;
};

const DEFAULT_ERRORS: Array<400 | 401 | 403 | 404 | 409> = [401, 403];

const errorSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: false },
    error: {
      type: 'object',
      properties: {
        code: { type: 'string', example: 'FORBIDDEN' },
        message: { type: 'string', example: 'Request is not allowed.' },
        details: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: true,
          },
        },
      },
    },
  },
};

const successSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      type: 'object',
      additionalProperties: true,
    },
    meta: {
      type: 'object',
      additionalProperties: true,
      nullable: true,
    },
  },
};

function errorDecorator(status: 400 | 401 | 403 | 404 | 409) {
  const common = { schema: errorSchema };
  switch (status) {
    case 400:
      return ApiBadRequestResponse({
        ...common,
        description: 'Validation error. Typical code: VALIDATION_ERROR.',
      });
    case 401:
      return ApiUnauthorizedResponse({
        ...common,
        description:
          'Anonymous or invalid session. Typical code: UNAUTHORIZED.',
      });
    case 403:
      return ApiForbiddenResponse({
        ...common,
        description:
          'Authenticated user does not have the required role/access.',
      });
    case 404:
      return ApiNotFoundResponse({
        ...common,
        description: 'Resource was not found. Typical code: NOT_FOUND.',
      });
    case 409:
      return ApiConflictResponse({
        ...common,
        description:
          'Business rule conflict, such as duplicate or invalid state.',
      });
  }
}

export function ApiEndpointDoc(options: ApiDocOptions) {
  const roleText = options.roles?.length
    ? `Role access: ${options.roles.join(', ')}.`
    : 'Role access: public or Better Auth managed.';
  const queryText = options.queryParams?.length
    ? `Query params: ${options.queryParams.join(', ')}.`
    : undefined;
  const description = [options.description, roleText, queryText]
    .filter(Boolean)
    .join('\n\n');
  const decorators = [
    ApiOperation({
      summary: options.summary,
      description,
      deprecated: options.deprecated,
    }),
    ApiCookieAuth('sessionCookie'),
    ApiOkResponse({
      description: options.responseDescription ?? 'Success response envelope.',
      schema: successSchema,
    }),
    ...(options.body ? [ApiBody({ type: options.body })] : []),
    ...(options.query
      ? [
          ApiQuery({
            name: 'query',
            type: options.query,
            required: false,
            description:
              'Documented query DTO. Send fields as standard query string parameters.',
          }),
        ]
      : []),
    ...(options.errors ?? DEFAULT_ERRORS).map(errorDecorator),
  ];

  return applyDecorators(...decorators);
}
