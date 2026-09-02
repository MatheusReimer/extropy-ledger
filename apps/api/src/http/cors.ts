import type { HttpRequest, HttpResponse } from './types.js';

const ALLOWED_METHODS = 'GET,POST,PATCH,DELETE,OPTIONS';
const ALLOWED_HEADERS = 'Content-Type,Authorization';

/**
 * Explicit allowlist - never a wildcard.
 *
 * This API returns one authenticated account's data; reflecting whatever Origin
 * arrives would let any site start requests carrying the victim's token. The
 * only accepted absence is a missing Origin (curl, health checks), which a
 * browser never omits on a cross-origin request.
 */
export function resolveCorsHeaders(
  origin: string | undefined,
  allowedOrigins: readonly string[],
): Record<string, string> {
  if (!origin || !allowedOrigins.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': ALLOWED_METHODS,
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export const isPreflight = (request: HttpRequest): boolean => request.method === 'OPTIONS';

export const preflightResponse = (): HttpResponse => ({ status: 204 });
