import { CURRENCIES, LOCALES, type UserDto } from '@expense/shared';
import { z } from 'zod';
import { toUserDto } from '../db/mappers.js';
import { notFound } from '../http/errors.js';
import type { AuthedHandler } from '../http/types.js';
import { parseInput } from '../http/validate.js';
import { getRate } from '../lib/rates.js';
import { BASE_CURRENCY, isCurrency } from '@expense/shared';

/**
 * Both fields optional, at least one required.
 *
 * A PATCH with an empty body is almost always a bug in the caller, and silently
 * succeeding hides it.
 */
const preferencesSchema = z
  .object({
    displayCurrency: z.enum(CURRENCIES).optional(),
    locale: z.enum(LOCALES).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one preference');

/**
 * Preferences change how amounts are READ, never what was stored.
 *
 * Switching display currency does not touch a single expense: each one keeps the
 * amount and currency it was spent in. That separation is what makes the setting
 * safe to change at any time - and what stops a rate movement rewriting history.
 */
export const updatePreferences: AuthedHandler = async (request) => {
  const input = parseInput(preferencesSchema, request.body);
  const updated = await request.repos.user.updatePreferences(input);
  if (!updated) throw notFound('Account not found');

  const body: UserDto = toUserDto(updated);
  return { status: 200, body };
};

const rateQuerySchema = z.object({ to: z.enum(CURRENCIES) });

/**
 * The base-to-display rate, so the client can render every figure from one number.
 *
 * Rows and totals are converted with the SAME rate in the same view. Converting
 * each row independently would let rounding drift until the visible rows no
 * longer add up to the visible total - the kind of discrepancy that makes people
 * stop trusting a money app entirely.
 *
 * Today's rate, not the transaction date's: the expense already banked its
 * historical rate at write time. This second step answers "what is that worth to
 * me now", which is a different and deliberately current question.
 */
export const latestRate: AuthedHandler = async (request) => {
  const { to } = parseInput(rateQuerySchema, request.query);

  const found = isCurrency(to) ? await getRate(BASE_CURRENCY, to, 'latest') : undefined;

  return {
    status: 200,
    body: {
      base: BASE_CURRENCY,
      to,
      // A missing rate is reported as null rather than as 1. Pretending parity
      // would show a Brazilian total in dollars and call it reais.
      rate: found?.rate ?? null,
      asOf: found?.asOf ?? null,
    },
  };
};
