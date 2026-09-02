import { describe, expect, it, vi } from 'vitest';
import { HttpError } from '../src/http/errors.js';
import { fakeRepositories } from './helpers/fake-repositories.js';
import { requireAuth } from '../src/middleware/auth.js';
import { signAccessToken, verifyAccessToken } from '../src/lib/jwt.js';
import { hashPassword, verifyPassword } from '../src/lib/password.js';
import type { AuthedRequest, HttpRequest } from '../src/http/types.js';

const request = (headers: Record<string, string | undefined> = {}): HttpRequest => ({
  method: 'GET',
  path: '/expenses',
  query: {},
  headers,
  params: {},
  body: undefined,
});

describe('password hashing', () => {
  it('accepts the right password and rejects the wrong one', async () => {
    const stored = await hashPassword('correct horse battery');
    await expect(verifyPassword('correct horse battery', stored)).resolves.toBe(true);
    await expect(verifyPassword('correct horse batter', stored)).resolves.toBe(false);
  });

  it('salts, so the same password never produces the same hash', async () => {
    const [first, second] = await Promise.all([hashPassword('same'), hashPassword('same')]);
    expect(first).not.toBe(second);
  });

  it('embeds the parameters so old hashes stay verifiable after a cost bump', async () => {
    const stored = await hashPassword('whatever');
    expect(stored).toMatch(/^scrypt\$\d+\$\d+\$\d+\$/);
  });

  it('returns false rather than throwing on a malformed stored hash', async () => {
    await expect(verifyPassword('x', 'not-a-real-hash')).resolves.toBe(false);
  });
});

describe('access tokens', () => {
  it('round-trips the user id', async () => {
    const token = await signAccessToken('507f1f77bcf86cd799439011');
    await expect(verifyAccessToken(token)).resolves.toEqual({ userId: '507f1f77bcf86cd799439011' });
  });

  it('rejects a tampered signature', async () => {
    const token = await signAccessToken('507f1f77bcf86cd799439011');
    const tampered = `${token.slice(0, -4)}AAAA`;
    await expect(verifyAccessToken(tampered)).resolves.toBeUndefined();
  });

  /**
   * The `alg: none` attack: swap the header for `{"alg":"none"}` and drop the
   * signature. If the verifier trusts the algorithm declared inside the token,
   * anyone can forge any user.
   */
  it('rejects an unsigned token that claims alg:none', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: 'attacker' })).toString('base64url');
    await expect(verifyAccessToken(`${header}.${payload}.`)).resolves.toBeUndefined();
  });

  it('rejects a token that is not a JWT at all', async () => {
    await expect(verifyAccessToken('hello')).resolves.toBeUndefined();
  });
});

describe('requireAuth', () => {
  const passthrough = vi.fn(async (authed: AuthedRequest) => ({ status: 200, body: authed.userId }));
  // No database: the middleware takes its repository factory as a parameter.
  const fakeRepos = async () => fakeRepositories();

  it('passes the verified userId to the handler', async () => {
    const token = await signAccessToken('507f1f77bcf86cd799439011');
    const response = await requireAuth(passthrough, fakeRepos)(
      request({ authorization: `Bearer ${token}` }),
    );
    expect(response.body).toBe('507f1f77bcf86cd799439011');
  });

  it('rejects a request with no Authorization header', async () => {
    await expect(requireAuth(passthrough, fakeRepos)(request())).rejects.toMatchObject({ status: 401 });
  });

  it('rejects a header that is not a bearer token', async () => {
    const promise = requireAuth(passthrough, fakeRepos)(request({ authorization: 'Basic abc123' }));
    await expect(promise).rejects.toBeInstanceOf(HttpError);
  });

  it('rejects a forged token', async () => {
    const promise = requireAuth(passthrough, fakeRepos)(request({ authorization: 'Bearer a.b.c' }));
    await expect(promise).rejects.toMatchObject({ status: 401 });
  });
});
