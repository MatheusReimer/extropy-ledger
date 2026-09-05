import { unauthorized } from '../http/errors.js';
import type { AuthedHandler, Handler } from '../http/types.js';
import { verifyAccessToken } from '../lib/jwt.js';
import { repositoriesFor } from '../db/repositories/mongo.js';
import type { Repositories } from '../db/repositories/types.js';

const BEARER = /^Bearer (.+)$/i;

function readAuthorization(
  headers: Readonly<Record<string, string | undefined>>,
): string | undefined {
  return headers['authorization'] ?? headers['Authorization'];
}

export function requireAuth(
  handler: AuthedHandler,
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
