import { BASE_CURRENCY, CURRENCIES, isCurrency } from '@expense/shared';
import { z } from 'zod';
import type { AuthedHandler } from '../http/types.js';
import { parseInput } from '../http/validate.js';
import { getRate } from '../lib/rates.js';

const rateQuerySchema = z.object({ to: z.enum(CURRENCIES) });

export const latestRate: AuthedHandler = async (request) => {
  const { to } = parseInput(rateQuerySchema, request.query);

  const found = isCurrency(to)
    ? await getRate(BASE_CURRENCY, to, 'latest', request.repos.rates)
    : undefined;

  return {
    status: 200,
    body: {
      base: BASE_CURRENCY,
      to,
      rate: found?.rate ?? null,
      asOf: found?.asOf ?? null,
    },
  };
};
