import { summaryQuerySchema } from '@expense/shared';
import { buildSummary, monthRange, type CategoryTotal } from '../reports/summary.js';
import type { AuthedHandler } from '../http/types.js';
import { parseInput } from '../http/validate.js';

export const monthlySummary: AuthedHandler = async (request) => {
  const { month } = parseInput(summaryQuerySchema, request.query);
  const { from, to } = monthRange(month);
  // The summing happens in the database, not in Node: pulling every expense of
  // the month back to add them up scales with the user's volume; $group does not.
  const rows = await request.repos.expenses.totalsByCategory(from, to);

  const unconvertedCount = await request.repos.expenses.countInRange(from, to);

  // Categories are few (11 plus custom ones), so a second find is both cheaper
  // and more readable than a $lookup - and it keeps the join in testable code.
  const categoryDocs = await request.repos.categories.list();
  const names = new Map(categoryDocs.map((doc) => [doc._id.toHexString(), doc.name]));

  const totals: CategoryTotal[] = rows.map((row) => ({
    categoryId: row.categoryId.toHexString(),
    totalCents: row.totalCents,
    count: row.count,
  }));

  return { status: 200, body: buildSummary(month, totals, names, unconvertedCount) };
};
