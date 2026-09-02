import { trendQuerySchema } from '@expense/shared';
import { buildTrend, monthsEndingAt, type MonthTotal } from '../reports/trend.js';
import type { AuthedHandler } from '../http/types.js';
import { parseInput } from '../http/validate.js';

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
