import { unauthorized } from '../http/errors.js';
import type { AuthedHandler, Handler } from '../http/types.js';
import { verifyAccessToken } from '../lib/jwt.js';

const BEARER = /^Bearer (.+)$/i;

/** Header casing varies by transport, so normalise on read. */
function readAuthorization(
  headers: Readonly<Record<string, string | undefined>>,
): string | undefined {
  return headers['authorization'] ?? headers['Authorization'];
}

/**
 * Proves WHO the user is - never what they are allowed to touch.
 *
 * Per-resource authorisation lives in each route, as a `userId` filter on the
 * query itself. A middleware that "protects the route" plus a handler that
 * looks up by `_id` alone is the exact recipe for IDOR (OWASP A01):
 * authenticated, and still reading somebody else's expense.
 */
export function requireAuth(handler: AuthedHandler): Handler {
  return async (request) => {
    const match = BEARER.exec(readAuthorization(request.headers) ?? '');
    const token = match?.[1];
    if (!token) throw unauthorized('Missing bearer token');

    const verified = await verifyAccessToken(token);
    if (!verified) throw unauthorized('Invalid or expired token');

    return handler({ ...request, userId: verified.userId });
  };
}
