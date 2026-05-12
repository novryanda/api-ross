export type ApiResponseMeta = Record<string, unknown>;

export type ApiSuccessResponse<TData = unknown> = {
  success: true;
  data: TData;
  meta?: ApiResponseMeta;
};

export type ApiErrorDetail = {
  field?: string;
  message: string;
  [key: string]: unknown;
};

export type ApiErrorBody = {
  code: string;
  message: string;
  details: ApiErrorDetail[];
};

export type ApiErrorResponse = {
  success: false;
  error: ApiErrorBody;
};

export type ApiEnvelope<TData = unknown> =
  | ApiSuccessResponse<TData>
  | ApiErrorResponse;

export function successResponse<TData>(
  data: TData,
  meta?: ApiResponseMeta,
): ApiSuccessResponse<TData> {
  return meta ? { success: true, data, meta } : { success: true, data };
}

export function errorResponse(error: ApiErrorBody): ApiErrorResponse {
  return {
    success: false,
    error: {
      ...error,
      details: error.details ?? [],
    },
  };
}

export function isApiEnvelope(value: unknown): value is ApiEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    'success' in value &&
    typeof (value as { success?: unknown }).success === 'boolean'
  );
}
