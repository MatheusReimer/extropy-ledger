import { summaryQuerySchema, trendQuerySchema } from '@expense/shared';
import { buildSummary, monthRange, type CategoryTotal } from '../reports/summary.js';
import { buildTrend, monthsEndingAt, type MonthTotal } from '../reports/trend.js';
import type { AuthedHandler } from '../http/types.js';
import { parseInput } from '../http/validate.js';

export const monthlySummary: AuthedHandler = async (request) => {
  const { month } = parseInput(summaryQuerySchema, request.query);
  const { from, to } = monthRange(month);
  const rows = await request.repos.expenses.totalsByCategory(from, to);

  const unconvertedCount = await request.repos.expenses.countUnconverted(from, to);

  const categoryDocs = await request.repos.categories.list();
  const names = new Map(categoryDocs.map((doc) => [doc._id.toHexString(), doc.name]));

  const totals: CategoryTotal[] = rows.map((row) => ({
    categoryId: row.categoryId.toHexString(),
    totalCents: row.totalCents,
    count: row.count,
  }));

  return { status: 200, body: buildSummary(month, totals, names, unconvertedCount) };
};

export const monthlyTrend: AuthedHandler = async (request) => {
  const { to, months } = parseInput(trendQuerySchema, request.query);
  const window = monthsEndingAt(to, months);

  const first = window[0];
  const last = window[window.length - 1];
  if (!first || !last) return { status: 200, body: [] };

  const rows = await request.repos.expenses.totalsByMonth(`${first}-01`, `${last}-31`);

  const totals: MonthTotal[] = rows.map((row) => ({
    month: row.month,
    totalCents: row.totalCents,
    count: row.count,
  }));

  return { status: 200, body: buildTrend(window, totals) };
};
