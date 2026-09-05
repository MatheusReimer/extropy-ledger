import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearRateMemo, getRate, toBaseCents } from '../src/lib/rates.js';
import { fakeRepositories, type FakeRepositories } from './helpers/fake-repositories.js';
import { latestRate } from '../src/routes/rates.js';
import type { AuthedRequest } from '../src/http/types.js';

/**
 * The currency layer, which had no tests until now.
 *
 * `currency.test.ts` in `packages/shared` covers the arithmetic - rounding,
 * minor units, formatting. None of that touches the part that can actually lose
 * a user's money: deciding WHICH rate to apply, when to reuse a stored one, and
 * what to do when there is no rate at all. That decision lives here.
 *
 * `getRate` now takes the rate store as an argument. Before, it reached for
 * `getCollections()` itself, which is why none of this could be tested without a
 * live MongoDB - the same reason the route handlers could not be tested before
 * the repositories existed.
 */

const rates = () => fakeRepositories().rates;

/** A Frankfurter-shaped success. */
const respondWith = (body: unknown, ok = true, status = 200) =>
  vi.fn(() =>
    Promise.resolve({ ok, status, json: () => Promise.resolve(body) } as unknown as Response),
  );

beforeEach(() => {
  clearRateMemo();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getRate', () => {
  /**
   * The whole point of the design. A silent 1.0 turns 15,000 JPY into $15,000
   * and looks entirely plausible on screen, so a missing rate has to be
   * `undefined` and stay `undefined` all the way up.
   */
  it('returns undefined rather than falling back to a rate of 1', async () => {
    vi.stubGlobal('fetch', respondWith({}, false, 503));

    expect(await getRate('BRL', 'USD', '2026-09-01', rates())).toBeUndefined();
  });

  it('returns undefined when the payload carries no usable number', async () => {
    vi.stubGlobal('fetch', respondWith({ date: '2026-09-01', rates: { USD: 0 } }));

    expect(await getRate('BRL', 'USD', '2026-09-01', rates())).toBeUndefined();
  });

  it('returns undefined when the network is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))),
    );

    expect(await getRate('BRL', 'USD', '2026-09-01', rates())).toBeUndefined();
  });

  /** Identity never leaves the process, so it must not cost a request. */
  it('short-circuits a same-currency pair without calling out', async () => {
    const fetchMock = respondWith({});
    vi.stubGlobal('fetch', fetchMock);

    expect(await getRate('USD', 'USD', '2026-09-01', rates())).toEqual({
      rate: 1,
      asOf: '2026-09-01',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('marks an identity rate for "latest" so it is never mistaken for a quote', async () => {
    const found = await getRate('USD', 'USD', 'latest', rates());
    expect(found).toEqual({ rate: 1, asOf: 'identity' });
  });

  it('reports the date the rate is actually FOR, not the date asked for', async () => {
    vi.stubGlobal('fetch', respondWith({ date: '2026-08-29', rates: { USD: 0.18 } }));

    const found = await getRate('BRL', 'USD', '2026-08-30', rates());
    expect(found).toEqual({ rate: 0.18, asOf: '2026-08-29' });
  });

  it('stores a fetched rate so a later request does not re-fetch it', async () => {
    const fetchMock = respondWith({ date: '2026-09-01', rates: { USD: 0.19 } });
    vi.stubGlobal('fetch', fetchMock);
    const store = rates();

    await getRate('BRL', 'USD', '2026-09-01', store);
    clearRateMemo();
    await getRate('BRL', 'USD', '2026-09-01', store);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  /**
   * A historical rate is a fact and never expires; "latest" is a moving target
   * and does. Persisting the wrong one forever would freeze a stale quote.
   */
  it('gives a historical rate no expiry and "latest" one', async () => {
    vi.stubGlobal('fetch', respondWith({ date: '2026-09-01', rates: { USD: 0.19 } }));
    const store = rates();

    await getRate('BRL', 'USD', '2026-09-01', store);
    await getRate('BRL', 'USD', 'latest', store);

    const historical = await store.find('2026-09-01:BRL:USD');
    const latest = await store.find('latest:BRL:USD');

    expect(historical?.expiresAt).toBeUndefined();
    expect(latest?.expiresAt).toBeInstanceOf(Date);
  });

  it('re-fetches a stored "latest" once it has expired', async () => {
    const fetchMock = respondWith({ date: '2026-09-02', rates: { USD: 0.2 } });
    vi.stubGlobal('fetch', fetchMock);

    const store = fakeRepositories({
      rates: [
        {
          _id: 'latest:BRL:USD',
          rate: 0.19,
          asOf: '2026-08-01',
          fetchedAt: new Date('2026-08-01'),
          expiresAt: new Date('2026-08-01'),
        },
      ],
    }).rates;

    const found = await getRate('BRL', 'USD', 'latest', store);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(found?.rate).toBe(0.2);
  });

  it('keys the cache by pair AND date, so two dates cannot share a rate', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve(
              url.includes('2026-09-01')
                ? { date: '2026-09-01', rates: { USD: 0.19 } }
                : { date: '2026-09-02', rates: { USD: 0.21 } },
            ),
        } as unknown as Response),
      ),
    );
    const store = rates();

    expect((await getRate('BRL', 'USD', '2026-09-01', store))?.rate).toBe(0.19);
    expect((await getRate('BRL', 'USD', '2026-09-02', store))?.rate).toBe(0.21);
  });
});

describe('toBaseCents', () => {
  it('converts once from the original amount', async () => {
    vi.stubGlobal('fetch', respondWith({ date: '2026-09-01', rates: { USD: 0.19 } }));

    const converted = await toBaseCents(10_000, 'BRL', '2026-09-01', rates());
    expect(converted).toEqual({ baseCents: 1_900, rate: 0.19, asOf: '2026-09-01' });
  });

  /**
   * The expense still saves; it simply lands with `baseCents: null` and is
   * counted as unconverted in the report rather than being dropped or guessed.
   */
  it('returns undefined when no rate can be had, so the caller stores null', async () => {
    vi.stubGlobal('fetch', respondWith({}, false, 503));

    expect(await toBaseCents(10_000, 'BRL', '2026-09-01', rates())).toBeUndefined();
  });

  it('leaves a base-currency amount untouched without a request', async () => {
    const fetchMock = respondWith({});
    vi.stubGlobal('fetch', fetchMock);

    const converted = await toBaseCents(2_500, 'USD', '2026-09-01', rates());
    expect(converted?.baseCents).toBe(2_500);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('GET /rates', () => {
  let repos: FakeRepositories;

  const request = (to: string) =>
    ({
      query: { to },
      repos,
      userId: 'u',
      params: {},
      headers: {},
      body: undefined,
      method: 'GET',
      path: '/rates',
    }) as unknown as AuthedRequest;

  beforeEach(() => {
    repos = fakeRepositories();
  });

  it('answers with the rate and the date it is for', async () => {
    vi.stubGlobal('fetch', respondWith({ date: '2026-09-01', rates: { BRL: 5.2 } }));

    const response = await latestRate(request('BRL'));
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ base: 'USD', to: 'BRL', rate: 5.2, asOf: '2026-09-01' });
  });

  /**
   * A 200 with `rate: null` rather than a 5xx: the UI needs to render the page
   * and say amounts are shown as spent. An error would leave it with nothing.
   */
  it('answers 200 with a null rate when the upstream is down', async () => {
    vi.stubGlobal('fetch', respondWith({}, false, 502));

    const response = await latestRate(request('BRL'));
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ rate: null, asOf: null });
  });

  it('rejects a currency that is not on the list', async () => {
    await expect(latestRate(request('XYZ'))).rejects.toThrow();
  });
});
