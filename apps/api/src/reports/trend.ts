import type { MonthlyTrendPoint } from '@expense/shared';
import type { MonthTotalRow } from '../db/repositories/types.js';

export function monthsEndingAt(to: string, count: number): string[] {
  const [year, month] = to.split('-').map(Number);
  if (!year || !month) return [];

  const months: string[] = [];
  for (let back = count - 1; back >= 0; back -= 1) {
    const index = year * 12 + (month - 1) - back;
    months.push(`${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`);
  }
  return months;
}

export function buildTrend(
  months: readonly string[],
  totals: readonly MonthTotalRow[],
): MonthlyTrendPoint[] {
  const byMonth = new Map(totals.map((total) => [total.month, total]));
  return months.map((month) => ({
    month,
    totalCents: byMonth.get(month)?.totalCents ?? 0,
    expenseCount: byMonth.get(month)?.count ?? 0,
  }));
}
