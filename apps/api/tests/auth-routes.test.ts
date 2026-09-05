import { describe, expect, it } from 'vitest';
import { ObjectId } from 'mongodb';
import { login, signup } from '../src/routes/auth.js';
import { updatePreferences } from '../src/routes/preferences.js';
import { HttpError } from '../src/http/errors.js';
import { hashPassword } from '../src/lib/password.js';
import { verifyAccessToken } from '../src/lib/jwt.js';
import { PREDEFINED_CATEGORIES } from '@expense/shared';
import type { AuthedRequest, HttpRequest } from '../src/http/types.js';
import type { UserDoc } from '../src/db/types.js';
import { fakeAccounts, fakeRepositories } from './helpers/fake-repositories.js';

/**
 * The sign-up and log-in handlers.
 *
 * `security.test.ts` already covers the primitives these compose - scrypt,
 * HS256, `requireAuth`. What it could not reach was the handlers themselves,
 * because both opened a MongoDB collection directly. They now take an injected
 * account repository, so the parts that only exist at the handler level are
 * testable: the 409 on a duplicate email, the identical answer for an unknown
 * email and a wrong password, and the categories a new account starts with.
 */

const request = (body: unknown): HttpRequest =>
  ({ body, query: {}, params: {}, headers: {}, method: 'POST', path: '/auth' }) as HttpRequest;

const existing = async (email: string, password: string): Promise<UserDoc> => ({
  _id: new ObjectId(),
  email,
  passwordHash: await hashPassword(password),
  createdAt: new Date(),
});

const status = async (promise: Promise<unknown>): Promise<number> => {
  try {
    await promise;
    return 0;
  } catch (error) {
    return error instanceof HttpError ? error.status : -1;
  }
};

describe('signup', () => {
  it('creates the account and answers with a usable token', async () => {
    const accounts = fakeAccounts();

    const response = await signup(async () => accounts)(
      request({ email: 'new@example.com', password: 'long-enough-password' }),
    );

    expect(response.status).toBe(201);
    expect(accounts.state.users).toHaveLength(1);

    const token = (response.body as { token: string }).token;
    const verified = await verifyAccessToken(token);
    expect(verified?.userId).toBe(accounts.state.users[0]?._id.toHexString());
  });

  /**
   * A new account with no categories cannot record an expense at all, since
   * every expense needs one. Seeding is part of sign-up, not a later step.
   */
  it('seeds the predefined categories against the new user', async () => {
    const accounts = fakeAccounts();

    await signup(async () => accounts)(
      request({ email: 'new@example.com', password: 'long-enough-password' }),
    );

    const userId = accounts.state.users[0]?._id;
    expect(accounts.state.categories.map((c) => c.name)).toEqual([...PREDEFINED_CATEGORIES]);
    expect(accounts.state.categories.every((c) => c.userId.equals(userId!))).toBe(true);
    expect(accounts.state.categories.every((c) => c.isCustom === false)).toBe(true);
  });

  it('never stores the password in the clear', async () => {
    const accounts = fakeAccounts();

    await signup(async () => accounts)(
      request({ email: 'new@example.com', password: 'long-enough-password' }),
    );

    const stored = accounts.state.users[0];
    expect(stored?.passwordHash).not.toContain('long-enough-password');
    expect(JSON.stringify(stored)).not.toContain('long-enough-password');
  });

  it('refuses a second account on the same email with 409', async () => {
    const accounts = fakeAccounts([await existing('taken@example.com', 'long-enough-password')]);

    const code = await status(
      signup(async () => accounts)(
        request({ email: 'taken@example.com', password: 'another-long-password' }),
      ),
    );

    expect(code).toBe(409);
    expect(accounts.state.users).toHaveLength(1);
  });

  it('rejects a password below the minimum before touching the store', async () => {
    const accounts = fakeAccounts();

    expect(
      await status(signup(async () => accounts)(request({ email: 'a@b.co', password: 'x' }))),
    ).toBe(422);
    expect(accounts.state.users).toHaveLength(0);
  });
});

describe('login', () => {
  it('answers with a token for the right password', async () => {
    const user = await existing('me@example.com', 'long-enough-password');
    const accounts = fakeAccounts([user]);

    const response = await login(async () => accounts)(
      request({ email: 'me@example.com', password: 'long-enough-password' }),
    );

    expect(response.status).toBe(200);
    const verified = await verifyAccessToken((response.body as { token: string }).token);
    expect(verified?.userId).toBe(user._id.toHexString());
  });

  /**
   * The two failures must be indistinguishable. If an unknown email answered
   * differently from a wrong password, the endpoint would confirm which emails
   * hold accounts - an enumeration oracle.
   */
  it('answers identically for an unknown email and a wrong password', async () => {
    const accounts = fakeAccounts([await existing('me@example.com', 'long-enough-password')]);
    const attempt = (email: string, password: string) =>
      login(async () => accounts)(request({ email, password })).catch((error: unknown) => error);

    const unknown = await attempt('nobody@example.com', 'long-enough-password');
    const wrong = await attempt('me@example.com', 'wrong-but-long-password');

    expect(unknown).toBeInstanceOf(HttpError);
    expect(wrong).toBeInstanceOf(HttpError);
    expect((unknown as HttpError).status).toBe((wrong as HttpError).status);
    expect((unknown as HttpError).message).toBe((wrong as HttpError).message);
  });

  /**
   * The message must not name the field that failed either, for the same reason.
   */
  it('never says which half of the credentials was wrong', async () => {
    const accounts = fakeAccounts();
    const error = await login(async () => accounts)(
      request({ email: 'nobody@example.com', password: 'long-enough-password' }),
    ).catch((caught: unknown) => caught);

    expect((error as HttpError).message).toBe('Invalid email or password');
  });
});

describe('PATCH /me/preferences', () => {
  const scope = (body: unknown, user?: UserDoc) => {
    const repos = fakeRepositories(user ? { user } : {});
    const request_ = {
      body,
      query: {},
      params: {},
      headers: {},
      method: 'PATCH',
      path: '/me/preferences',
      userId: user?._id.toHexString() ?? new ObjectId().toHexString(),
      repos,
    } as AuthedRequest;
    return { request: request_, repos };
  };

  const authed = (body: unknown, user?: UserDoc): AuthedRequest => scope(body, user).request;

  it('stores a display currency and returns the updated account', async () => {
    const user = await existing('me@example.com', 'long-enough-password');
    const { request: patch, repos } = scope({ displayCurrency: 'BRL' }, user);

    const response = await updatePreferences(patch);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ displayCurrency: 'BRL' });
    expect(repos.state.user?.displayCurrency).toBe('BRL');
  });

  /**
   * Reading Portuguese does not imply thinking in reais, so one preference must
   * not quietly write the other. The DTO always reports a currency - it defaults
   * to USD - so the claim has to be checked against what was STORED.
   */
  it('stores a locale without inventing a currency', async () => {
    const user = await existing('me@example.com', 'long-enough-password');
    const { request: patch, repos } = scope({ locale: 'pt' }, user);

    const response = await updatePreferences(patch);

    expect(response.body).toMatchObject({ locale: 'pt' });
    expect(repos.state.user?.locale).toBe('pt');
    expect(repos.state.user?.displayCurrency).toBeUndefined();
  });

  it('never returns the password hash', async () => {
    const user = await existing('me@example.com', 'long-enough-password');
    const response = await updatePreferences(authed({ locale: 'es' }, user));

    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
  });

  it('refuses an empty patch rather than writing nothing', async () => {
    const user = await existing('me@example.com', 'long-enough-password');
    expect(await status(updatePreferences(authed({}, user)))).toBe(422);
  });

  it('rejects a currency and a locale that are not supported', async () => {
    const user = await existing('me@example.com', 'long-enough-password');
    expect(await status(updatePreferences(authed({ displayCurrency: 'XYZ' }, user)))).toBe(422);
    expect(await status(updatePreferences(authed({ locale: 'kr' }, user)))).toBe(422);
  });

  it('answers 404 when the account is gone', async () => {
    expect(await status(updatePreferences(authed({ locale: 'pt' })))).toBe(404);
  });
});
