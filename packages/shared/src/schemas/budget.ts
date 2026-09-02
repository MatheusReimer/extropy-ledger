import { z } from 'zod';

/**
 * A monthly ceiling for one category.
 *
 * Stored in the BASE currency, not the user's display currency, because that is
 * the unit the monthly report already sums (`baseCents`). Keeping the budget in
 * the same unit as the number it is compared against means the comparison is
 * plain arithmetic with no rate lookup in the reporting path - and so no new
 * failure mode where a budget cannot be evaluated because an exchange rate was
 * unavailable. The form converts once on the way in and back on the way out,
 * exactly as every other total on the dashboard is displayed.
 */
export const setBudgetSchema = z.object({
  /**
   * Deliberately NOT `amountCentsSchema`, which requires a positive value.
   *
   * An expense of zero is meaningless; a budget of zero is not - it says "spend
   * nothing on this category", which is the whole point of budgeting some of
   * them. Sharing the schema would have quietly forbidden that, so the bound
   * that actually differs is written out rather than inherited.
   */
  limitCents: z
    .number()
    .int('Budget must be a whole number of cents')
    .min(0, 'Budget cannot be negative')
    .max(1_000_000_000_000, 'Budget is too large'),
});

export type SetBudgetInput = z.infer<typeof setBudgetSchema>;
