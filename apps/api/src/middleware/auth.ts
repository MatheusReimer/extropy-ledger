import { unauthorized } from '../http/errors.js';
import type { AuthedHandler, Handler } from '../http/types.js';
import { verifyAccessToken } from '../lib/jwt.js';
import { repositoriesFor } from '../db/repositories/mongo.js';
import type { Repositories } from '../db/repositories/types.js';

const BEARER = /^Bearer (.+)$/i;

/** Header casing varies by transport, so normalise on read. */
function readAuthorization(
  headers: Readonly<Record<string, string | undefined>>,
): string | undefined {
  return headers['authorization'] ?? headers['Authorization'];
}

/**
 * Proves who the user is, and hands the handler a database scoped to them.
 *
 * A middleware that "protects the route" plus a handler that looks up by `_id`
 * alone is the exact recipe for IDOR (OWASP A01): authenticated, and still
 * reading somebody else's expense. Authentication cannot fix that on its own -
 * every query has to carry the owner in its FILTER.
 *
 * So this is the only place repositories are built, and they are built bound to
 * the id just verified. A handler has no way to ask for another user's data,
 * because nothing it can call takes a user id.
 */
export function requireAuth(
  handler: AuthedHandler,
  /**
   * Injected so this middleware can be tested without a database, and so a route
   * test can hand its handler an in-memory fake.
   *
   * The default is the real thing, so production wiring stays `requireAuth(fn)`
   * with nothing to remember. Making the seam explicit here rather than reaching
   * for a module mock keeps the dependency visible in the signature.
   */
  buildRepos: (userId: string) => Promise<Repositories> = repositoriesFor,
): Handler {
  return async (request) => {
    const match = BEARER.exec(readAuthorization(request.headers) ?? '');
    const token = match?.[1];
    if (!token) throw unauthorized('Missing bearer token');

    const verified = await verifyAccessToken(token);
    if (!verified) throw unauthorized('Invalid or expired token');

    const repos = await buildRepos(verified.userId);
    return handler({ ...request, userId: verified.userId, repos });
  };
}
