import { summaryQuerySchema } from '@expense/shared';
import type { ObjectId } from 'mongodb';
import { getCollections } from '../db/client.js';
import { buildSummary, monthRange, type CategoryTotal } from '../reports/summary.js';
import type { AuthedHandler } from '../http/types.js';
import { parseInput } from '../http/validate.js';
import { toObjectId } from '../lib/ids.js';

type GroupRow = { _id: ObjectId; totalCents: number; count: number };

export const monthlySummary: AuthedHandler = async (request) => {
  const { month } = parseInput(summaryQuerySchema, request.query);
  const userId = toObjectId(request.userId);
  const { from, to } = monthRange(month);
  const { expenses, categories } = await getCollections();

  // The summing happens in the database, not in Node: pulling every expense of
  // the month back to add them up scales with the user's volume; $group does not.
  const rows = await expenses
    .aggregate<GroupRow>([
      // Only rows that HAVE a base value are summed. An expense whose rate could
      // not be fetched is counted separately rather than added at face value,
      // which would silently mix currencies into one number.
      { $match: { userId, date: { $gte: from, $lte: to }, baseCents: { $ne: null } } },
      { $group: { _id: '$categoryId', totalCents: { $sum: '$baseCents' }, count: { $sum: 1 } } },
    ])
    .toArray();

  const unconvertedCount = await expenses.countDocuments({
    userId,
    date: { $gte: from, $lte: to },
    baseCents: null,
  });

  // Categories are few (11 plus custom ones), so a second find is both cheaper
  // and more readable than a $lookup - and it keeps the join in testable code.
  const categoryDocs = await categories
    .find({ userId })
    .project<{ _id: ObjectId; name: string }>({ name: 1 })
    .toArray();
  const names = new Map(categoryDocs.map((doc) => [doc._id.toHexString(), doc.name]));

  const totals: CategoryTotal[] = rows.map((row) => ({
    categoryId: row._id.toHexString(),
    totalCents: row.totalCents,
    count: row.count,
  }));

  return { status: 200, body: buildSummary(month, totals, names, unconvertedCount) };
};
