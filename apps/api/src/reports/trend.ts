import type { MonthlyTrendPoint } from '@expense/shared';

export type MonthTotal = { month: string; totalCents: number; count: number };

/**
 * The N months ending at `to`, inclusive, oldest first.
 *
 * Built from the numbers rather than a `Date`, for the same reason the rest of
 * this codebase avoids them: `setMonth(-1)` in a timezone west of UTC can land
 * in the wrong year, and a chart whose first bar is silently mislabelled is
 * worse than one that fails loudly.
 */
export function monthsEndingAt(to: string, count: number): string[] {
  const [year, month] = to.split('-').map(Number);
  if (!year || !month) return [];

  const months: string[] = [];
  for (let back = count - 1; back >= 0; back -= 1) {
    // Zero-based month arithmetic, so the modulo wraps cleanly across years.
    const index = year * 12 + (month - 1) - back;
    months.push(`${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`);
  }
  return months;
}

/**
 * Fills the gaps.
 *
 * The database only knows about months that HAVE expenses, so a quiet March
 * simply is not in the result set. Dropping it would draw a chart where March
 * never happened and February sits next to April; a zero bar says "nothing that
 * month", which is the truth and is usually the interesting part.
 */
export function buildTrend(
  months: readonly string[],
  totals: readonly MonthTotal[],
): MonthlyTrendPoint[] {
  const byMonth = new Map(totals.map((total) => [total.month, total]));
  return months.map((month) => ({
    month,
    totalCents: byMonth.get(month)?.totalCents ?? 0,
    expenseCount: byMonth.get(month)?.count ?? 0,
  }));
}
