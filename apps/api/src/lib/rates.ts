import { BASE_CURRENCY, type CurrencyCode } from '@expense/shared';
import { getCollections } from '../db/client.js';
import { describeError, logger } from './logger.js';

/**
 * Frankfurter: ECB reference rates, no key, no quota.
 *
 * Chosen over the commercial APIs precisely because it needs no credential - a
 * reviewer can clone this repo and currency conversion works, with nothing extra
 * to sign up for. Same reasoning as the optional LLM keys.
 */
const ENDPOINT = 'https://api.frankfurter.app';
const REQUEST_TIMEOUT_MS = 4_000;

/**
 * A historical rate is a fact that never changes, so it is cached forever.
 * "Latest" moves, so it gets a short life.
 */
const LATEST_TTL_MS = 6 * 60 * 60 * 1000;

export type Rate = { rate: number; asOf: string };

const cacheKey = (from: string, to: string, date: string): string => `${date}:${from}:${to}`;

/** Per-container memo in front of the database, so a hot Lambda does no I/O at all. */
const memo = new Map<string, Rate>();

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

    // The API answers with the date it ACTUALLY used - ask for a weekend and you
    // get Friday. Recording that rather than the requested date keeps the stored
    // fact honest.
    return { rate, asOf: payload.date ?? String(date) };
  } catch (error) {
    logger.warn('fx unreachable', { from, to, date, ...describeError(error) });
    return undefined;
  }
}

/**
 * The rate from one currency to another on a given day.
 *
 * Three layers, cheapest first: an identity shortcut, a per-container memo, then
 * the database. Only a genuine miss reaches the network.
 *
 * Returns `undefined` rather than throwing or guessing. A wrong exchange rate is
 * far worse than a missing one - it produces a number that looks authoritative
 * and is not - so every caller has to decide what to do without one.
 */
export async function getRate(
  from: CurrencyCode,
  to: CurrencyCode,
  date: string | 'latest',
): Promise<Rate | undefined> {
  if (from === to) return { rate: 1, asOf: date === 'latest' ? 'identity' : date };

  const key = cacheKey(from, to, date);
  const memoed = memo.get(key);
  if (memoed) return memoed;

  const { rates } = await getCollections();
  const stored = await rates.findOne({ _id: key });
  if (stored && (!stored.expiresAt || stored.expiresAt > new Date())) {
    const hit = { rate: stored.rate, asOf: stored.asOf };
    memo.set(key, hit);
    return hit;
  }

  const fresh = await fetchRate(from, to, date);
  if (!fresh) return undefined;

  await rates.updateOne(
    { _id: key },
    {
      $set: {
        rate: fresh.rate,
        asOf: fresh.asOf,
        fetchedAt: new Date(),
        // A dated rate is immutable, so it never expires. "latest" does.
        ...(date === 'latest' ? { expiresAt: new Date(Date.now() + LATEST_TTL_MS) } : {}),
      },
    },
    { upsert: true },
  );

  memo.set(key, fresh);
  return fresh;
}

/**
 * Converts an amount into the base currency, at the rate on the day it happened.
 *
 * The transaction-date rate is used because it is a historical fact: it will
 * read the same in five years, so the value can be stored on the expense and
 * summed in the database rather than recomputed on every report.
 */
export async function toBaseCents(
  amountCents: number,
  currency: CurrencyCode,
  date: string,
): Promise<{ baseCents: number; rate: number; asOf: string } | undefined> {
  const found = await getRate(currency, BASE_CURRENCY, date);
  if (!found) return undefined;
  return { baseCents: Math.round(amountCents * found.rate), rate: found.rate, asOf: found.asOf };
}
