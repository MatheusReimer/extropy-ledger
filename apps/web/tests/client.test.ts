import { describe, expect, it } from 'vitest';
import { resolveApiBaseUrl } from '../src/api/client';

/**
 * These exist because of a real bug, not for coverage.
 *
 * `.env.example` ships `VITE_API_URL=` blank. Vite passes that through as `''`,
 * which is not nullish, so `?? '/api'` left the base URL empty and every request
 * went to `/auth/signup` instead of `/api/auth/signup`. The dev server answered
 * 404 and the UI showed a generic error with nothing to point at.
 *
 * It survived earlier testing because those runs set VITE_API_URL explicitly -
 * the one configuration a real developer following the README never uses.
 */
describe('resolveApiBaseUrl', () => {
  it('defaults to the same-origin /api when unset', () => {
    expect(resolveApiBaseUrl(undefined)).toBe('/api');
  });

  it('treats a blank value as unset, the way .env.example ships it', () => {
    expect(resolveApiBaseUrl('')).toBe('/api');
    expect(resolveApiBaseUrl('   ')).toBe('/api');
  });

  it('uses an explicit origin when one is configured', () => {
    expect(resolveApiBaseUrl('http://localhost:3000')).toBe('http://localhost:3000');
  });

  it('trims surrounding whitespace left by hand-edited .env files', () => {
    expect(resolveApiBaseUrl('  http://localhost:3000  ')).toBe('http://localhost:3000');
  });

  it('strips trailing slashes so paths never double up', () => {
    expect(resolveApiBaseUrl('http://localhost:3000/')).toBe('http://localhost:3000');
    expect(resolveApiBaseUrl('https://example.com/api//')).toBe('https://example.com/api');
  });
});
