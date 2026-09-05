import { BASE_CURRENCY, convertMinorUnits, type CurrencyCode } from '@expense/shared';
import type { RateRepository } from '../db/repositories/types.js';
import { describeError, logger } from './logger.js';

const ENDPOINT = 'https://api.frankfurter.app';
const REQUEST_TIMEOUT_MS = 4_000;

const LATEST_TTL_MS = 6 * 60 * 60 * 1000;

export type Rate = { rate: number; asOf: string };

const cacheKey = (from: string, to: string, date: string): string => `${date}:${from}:${to}`;

type Memoed = { rate: Rate; expiresAt: number | undefined };

const memo = new Map<string, Memoed>();

export const clearRateMemo = (): void => {
  memo.clear();
};

async function fetchRate(
  from: CurrencyCode,
  to: CurrencyCode,
  date: string | 'latest',
): Promise<Rate | undefined> {
  const url = `${ENDPOINT}/${date}?base=${from}&symbols=${to}`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) {
      logger.warn('fx request failed', { status: response.status, from, to, date });
      return undefined;
    }

    const payload = (await response.json()) as { date?: string; rates?: Record<string, number> };
    const rate = payload.rates?.[to];
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
      logger.warn('fx response had no usable rate', { from, to, date });
      return undefined;
    }

    return { rate, asOf: payload.date ?? String(date) };
  } catch (error) {
    logger.warn('fx unreachable', { from, to, date, ...describeError(error) });
    return undefined;
  }
}

export async function getRate(
  from: CurrencyCode,
  to: CurrencyCode,
  date: string | 'latest',
  rates: RateRepository,
): Promise<Rate | undefined> {
  if (from === to) return { rate: 1, asOf: date === 'latest' ? 'identity' : date };

  const key = cacheKey(from, to, date);
  const memoed = memo.get(key);
  if (memoed && (memoed.expiresAt === undefined || memoed.expiresAt > Date.now())) {
    return memoed.rate;
  }

  const stored = await rates.find(key);
  if (stored && (!stored.expiresAt || stored.expiresAt > new Date())) {
    const hit = { rate: stored.rate, asOf: stored.asOf };
    memo.set(key, { rate: hit, expiresAt: stored.expiresAt?.getTime() });
    return hit;
  }

  const fresh = await fetchRate(from, to, date);
  if (!fresh) return undefined;

  const expiresAt = date === 'latest' ? new Date(Date.now() + LATEST_TTL_MS) : undefined;

  await rates.save({
    _id: key,
    rate: fresh.rate,
    asOf: fresh.asOf,
    fetchedAt: new Date(),
    ...(expiresAt ? { expiresAt } : {}),
  });

  memo.set(key, { rate: fresh, expiresAt: expiresAt?.getTime() });
  return fresh;
}

export async function toBaseCents(
  amountCents: number,
  currency: CurrencyCode,
  date: string,
  rates: RateRepository,
): Promise<{ baseCents: number; rate: number; asOf: string } | undefined> {
  const found = await getRate(currency, BASE_CURRENCY, date, rates);
  if (!found) return undefined;
  return {
    baseCents: convertMinorUnits(amountCents, found.rate, currency, BASE_CURRENCY),
    rate: found.rate,
    asOf: found.asOf,
  };
}
