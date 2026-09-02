import type { ApiErrorBody, FieldErrors } from '@expense/shared';
import type { HttpResponse } from './types.js';

/**
 * The one place a class earns its keep on the backend.
 *
 * We need `instanceof` at the edge to tell "expected failure, becomes an HTTP
 * status" apart from "bug, becomes a 500", and we need a real stack trace when
 * it is a bug. A plain union type would give neither.
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: FieldErrors,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (message: string) => new HttpError(400, 'bad_request', message);
export const unauthorized = (message = 'Authentication required') =>
  new HttpError(401, 'unauthorized', message);
export const forbidden = (message = 'Not allowed') => new HttpError(403, 'forbidden', message);
export const notFound = (message = 'Not found') => new HttpError(404, 'not_found', message);
export const conflict = (message: string) => new HttpError(409, 'conflict', message);
export const unprocessable = (fields: FieldErrors) =>
  new HttpError(422, 'validation_failed', 'Some fields are invalid', fields);

/**
 * Turns any throw into a response.
 *
 * Unknown errors become a 500 with a deliberately generic message: internal
 * detail in an HTTP response is information disclosure (OWASP A05). The detail
 * goes to the log, not to the client.
 */
export function toErrorResponse(error: unknown): HttpResponse {
  if (error instanceof HttpError) {
    const body: ApiErrorBody = {
      error: {
        code: error.code,
        message: error.message,
        ...(error.fields ? { fields: error.fields } : {}),
      },
    };
    return { status: error.status, body };
  }

  const body: ApiErrorBody = {
    error: { code: 'internal_error', message: 'Something went wrong on our side' },
  };
  return { status: 500, body };
}
