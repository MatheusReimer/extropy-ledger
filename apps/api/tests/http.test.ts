import { describe, expect, it } from 'vitest';
import { HttpError, toErrorResponse } from '../src/http/errors.js';
import { matchRoute } from '../src/http/router.js';
import { resolveCorsHeaders } from '../src/http/cors.js';
import { buildConfig, ConfigError } from '../src/config.js';
import { buildSummary, monthRange } from '../src/reports/summary.js';
import type { Route } from '../src/http/types.js';

const noop = async () => ({ status: 200 });

const routes: Route[] = [
  { method: 'GET', path: '/expenses', handler: noop },
  { method: 'PATCH', path: '/expenses/:id', handler: noop },
  { method: 'GET', path: '/reports/summary', handler: noop },
];

describe('matchRoute', () => {
  it('matches a static path', () => {
    expect(matchRoute(routes, 'GET', '/expenses')?.route.path).toBe('/expenses');
  });

  it('extracts path parameters', () => {
    expect(matchRoute(routes, 'PATCH', '/expenses/abc123')?.params).toEqual({ id: 'abc123' });
  });

  it('does not match when only the method differs', () => {
    expect(matchRoute(routes, 'DELETE', '/expenses/abc123')).toBeUndefined();
  });

  it('does not let a dynamic segment swallow extra path segments', () => {
    expect(matchRoute(routes, 'PATCH', '/expenses/abc123/notes')).toBeUndefined();
  });

  it('ignores trailing slashes', () => {
    expect(matchRoute(routes, 'GET', '/expenses/')?.route.path).toBe('/expenses');
  });
});

describe('toErrorResponse', () => {
  it('surfaces an expected HttpError to the client', () => {
    const response = toErrorResponse(new HttpError(404, 'not_found', 'Expense not found'));
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: { code: 'not_found', message: 'Expense not found' } });
  });

  /**
   * Internal detail in an HTTP response is free reconnaissance for an attacker
   * (OWASP A05). The error text belongs in the log, not the body.
   */
  it('never leaks an internal message on an unexpected error', () => {
    const response = toErrorResponse(new Error('connection to mongodb://user:pw@host failed'));
    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain('mongodb://');
  });
});

describe('resolveCorsHeaders', () => {
  const allowed = ['https://app.example.com'];

  it('echoes an allowed origin', () => {
    expect(
      resolveCorsHeaders('https://app.example.com', allowed)['Access-Control-Allow-Origin'],
    ).toBe('https://app.example.com');
  });

  it('refuses an origin that is not on the allowlist', () => {
    expect(resolveCorsHeaders('https://evil.example.com', allowed)).toEqual({});
  });

  it('never answers with a wildcard', () => {
    const headers = resolveCorsHeaders('https://app.example.com', allowed);
    expect(headers['Access-Control-Allow-Origin']).not.toBe('*');
  });
});

describe('buildConfig', () => {
  it('lists every missing variable at once instead of failing one at a time', () => {
    try {
      buildConfig({});
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as Error).message).toContain('MONGODB_URI');
      expect((error as Error).message).toContain('JWT_SECRET');
    }
  });

  it('rejects a JWT secret that is too short to be safe', () => {
    expect(() => buildConfig({ MONGODB_URI: 'mongodb://x', JWT_SECRET: 'short' })).toThrow(
      ConfigError,
    );
  });

  it('treats the AI key as optional so the app runs without it', () => {
    const config = buildConfig({
      MONGODB_URI: 'mongodb://x',
      JWT_SECRET: 'a'.repeat(32),
    });
    expect(config.aiEnabled).toBe(false);
    expect(config.corsOrigins).toEqual(['http://localhost:5173']);
  });

  /**
   * .env.example ships `GEMINI_API_KEY=` blank. If a blank counted as "set",
   * copying the example file and filling in only the required lines would fail
   * to start - on the one variable documented as optional.
   */
  it('treats a blank value in .env as absent, not as an empty string', () => {
    const config = buildConfig({
      MONGODB_URI: 'mongodb://x',
      JWT_SECRET: 'a'.repeat(32),
      GEMINI_API_KEY: '',
      MONGODB_DB: '   ',
    });
    expect(config.aiEnabled).toBe(false);
    expect(config.MONGODB_DB).toBe('expense_tracker');
  });

  it('splits and trims the CORS allowlist', () => {
    const config = buildConfig({
      MONGODB_URI: 'mongodb://x',
      JWT_SECRET: 'a'.repeat(32),
      CORS_ORIGINS: 'https://a.com, https://b.com ',
    });
    expect(config.corsOrigins).toEqual(['https://a.com', 'https://b.com']);
  });
});

describe('monthly summary', () => {
  it('covers the whole month with string bounds', () => {
    expect(monthRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-31' });
  });

  /**
   * Expenses whose rate could not be fetched are excluded from the totals and
   * counted separately, so a report can admit a gap rather than under-report
   * silently.
   */
  it('reports how many expenses could not be converted', () => {
    const summary = buildSummary(
      '2026-09',
      [{ categoryId: 'a', totalCents: 100, count: 1 }],
      new Map(),
      2,
    );
    expect(summary.unconvertedCount).toBe(2);
    expect(summary.totalCents).toBe(100);
  });

  it('totals, counts and sorts by spend descending', () => {
    const names = new Map([
      ['a', 'Food'],
      ['b', 'Dining'],
    ]);
    const summary = buildSummary(
      '2026-09',
      [
        { categoryId: 'a', totalCents: 1_000, count: 2 },
        { categoryId: 'b', totalCents: 4_550, count: 3 },
      ],
      names,
    );

    expect(summary.totalCents).toBe(5_550);
    expect(summary.expenseCount).toBe(5);
    expect(summary.byCategory.map((item) => item.name)).toEqual(['Dining', 'Food']);
  });

  /**
   * A deleted category must not vanish from the report: if it did, the bars
   * would stop adding up to the total printed above them.
   */
  it('keeps a row whose category name is unknown', () => {
    const summary = buildSummary(
      '2026-09',
      [{ categoryId: 'gone', totalCents: 500, count: 1 }],
      new Map(),
    );
    expect(summary.byCategory[0]?.name).toBe('Unknown');
    expect(summary.totalCents).toBe(500);
  });

  it('reports zeroes for a month with no expenses', () => {
    expect(buildSummary('2026-09', [], new Map())).toEqual({
      month: '2026-09',
      totalCents: 0,
      expenseCount: 0,
      byCategory: [],
      unconvertedCount: 0,
    });
  });
});
