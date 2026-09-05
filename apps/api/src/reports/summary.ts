import type { CategoryBreakdown, MonthlySummary } from '@expense/shared';

export type CategoryTotal = {
  categoryId: string;
  totalCents: number;
  count: number;
};

export function monthRange(month: string): { from: string; to: string } {
  return { from: `${month}-01`, to: `${month}-31` };
}

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
