import { trendQuerySchema } from '@expense/shared';
import { getCollections } from '../db/client.js';
import { buildTrend, monthsEndingAt, type MonthTotal } from '../reports/trend.js';
import type { AuthedHandler } from '../http/types.js';
import { parseInput } from '../http/validate.js';
import { toObjectId } from '../lib/ids.js';

type GroupRow = { _id: string; totalCents: number; count: number };

export const monthlyTrend: AuthedHandler = async (request) => {
  const { to, months } = parseInput(trendQuerySchema, request.query);
  const userId = toObjectId(request.userId);
  const window = monthsEndingAt(to, months);

  const first = window[0];
  const last = window[window.length - 1];
  if (!first || !last) return { status: 200, body: [] };

  const { expenses } = await getCollections();
  const rows = await expenses
    .aggregate<GroupRow>([
      { $match: { userId, date: { $gte: `${first}-01`, $lte: `${last}-31` }, baseCents: { $ne: null } } },
      {
        // `date` is `YYYY-MM-DD`, so the month is the first seven characters -
        // no date parsing, no timezone, and it still uses the { userId, date }
        // index for the match.
        $group: {
          _id: { $substrBytes: ['$date', 0, 7] },
          totalCents: { $sum: '$baseCents' },
          count: { $sum: 1 },
        },
      },
    ])
    .toArray();

  const totals: MonthTotal[] = rows.map((row) => ({
    month: row._id,
    totalCents: row.totalCents,
    count: row.count,
  }));

  return { status: 200, body: buildTrend(window, totals) };
};
