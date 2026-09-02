import type { CategoryBreakdown, MonthlySummary } from '@expense/shared';

export type CategoryTotal = {
  categoryId: string;
  totalCents: number;
  count: number;
};

/**
 * The month range as plain strings.
 *
 * Because `date` is `YYYY-MM-DD`, a whole month fits lexicographically between
 * `-01` and `-31` - February included, since "2026-02-31" simply does not exist
 * as data and works fine as a ceiling. No calendar arithmetic, no timezone, no
 * month-boundary bug.
 */
export function monthRange(month: string): { from: string; to: string } {
  return { from: `${month}-01`, to: `${month}-31` };
}

/**
 * Joins per-category totals with their names, ordered from biggest spend down.
 *
 * Deliberately pure: this is the report's only arithmetic, and the part worth
 * testing. A category with no known name becomes "Unknown" rather than
 * disappearing - dropping the row would make the chart total disagree with the
 * month total printed above it.
 */
export function buildSummary(
  month: string,
  totals: readonly CategoryTotal[],
  categoryNames: ReadonlyMap<string, string>,
  unconvertedCount = 0,
): MonthlySummary {
  const byCategory: CategoryBreakdown[] = totals
    .map((total) => ({
      categoryId: total.categoryId,
      name: categoryNames.get(total.categoryId) ?? 'Unknown',
      totalCents: total.totalCents,
      count: total.count,
    }))
    .sort((a, b) => b.totalCents - a.totalCents);

  return {
    month,
    totalCents: byCategory.reduce((sum, item) => sum + item.totalCents, 0),
    expenseCount: byCategory.reduce((sum, item) => sum + item.count, 0),
    byCategory,
    unconvertedCount,
  };
}
