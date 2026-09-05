import { z } from 'zod';

export const setBudgetSchema = z.object({
  limitCents: z
    .number()
    .int('Budget must be a whole number of cents')
    .min(0, 'Budget cannot be negative')
    .max(1_000_000_000_000, 'Budget is too large'),
});
