import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiErrorBody,
  ApiErrorDetail,
  errorResponse,
} from '../http/api-response.js';

type NestErrorResponse = {
  statusCode?: number;
  code?: string;
  error?: string | { code?: string; message?: string; details?: unknown[] };
  message?: string | string[];
  details?: unknown[];
};

function defaultErrorCode(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return 'VALIDATION_ERROR';
    case HttpStatus.UNAUTHORIZED:
      return 'UNAUTHORIZED';
    case HttpStatus.FORBIDDEN:
      return 'FORBIDDEN';
    case HttpStatus.NOT_FOUND:
      return 'NOT_FOUND';
    case HttpStatus.CONFLICT:
      return 'CONFLICT';
    default:
      return status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR';
  }
}

function toDetails(value: unknown): ApiErrorDetail[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((detail) => {
    if (typeof detail === 'string') {
      return { message: detail };
    }

    if (typeof detail === 'object' && detail !== null && 'message' in detail) {
      return detail as ApiErrorDetail;
    }

    return { message: String(detail) };
  });
}

function normalizeHttpException(
  exception: HttpException,
  status: number,
): ApiErrorBody {
  const response = exception.getResponse();

  if (typeof response === 'string') {
    return {
      code: defaultErrorCode(status),
      message: response,
      details: [],
    };
  }

  const body = response as NestErrorResponse;
  const nestedError =
    typeof body.error === 'object' && body.error !== null ? body.error : null;
  const message = nestedError?.message ?? body.message ?? exception.message;
  const details = nestedError?.details ?? body.details ?? body.message;

  return {
    code: body.code ?? nestedError?.code ?? defaultErrorCode(status),
    message: Array.isArray(message)
      ? 'Validation failed.'
      : String(message ?? 'Request failed.'),
    details: toDetails(details),
  };
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const error = isHttpException
      ? normalizeHttpException(exception, status)
      : {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Unexpected server error.',
          details: [],
        };

    response.status(status).json(errorResponse(error));
  }
}
