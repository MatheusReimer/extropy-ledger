import { ObjectId, type Filter } from 'mongodb';
import { getCollections } from '../client.js';
import type { ExpenseDoc } from '../types.js';
import { toObjectId } from '../../lib/ids.js';
import type {
  BudgetRepository,
  CategoryRepository,
  CategoryTotalRow,
  ExpenseListFilter,
  ExpenseRepository,
  MonthTotalRow,
  ReceiptRepository,
  Repositories,
  UserRepository,
} from './types.js';

/**
 * The MongoDB implementation of the persistence surface.
 *
 * Every method below closes over one `userId` and puts it in the FILTER of every
 * query - which is the single place that rule now lives. `repositoriesFor` is
 * called by the auth middleware and nowhere else, so the id being scoped to is
 * always the authenticated one.
 *
 * The one deliberate exception is signup and login: those run BEFORE there is an
 * authenticated user, so `routes/auth.ts` still reaches for the collections
 * directly. A repository bound to a user is exactly the wrong shape for creating
 * that user.
 */
export async function repositoriesFor(userIdHex: string): Promise<Repositories> {
  const collections = await getCollections();
  const userId = toObjectId(userIdHex);

  const expenses: ExpenseRepository = {
    async list(filter: ExpenseListFilter) {
      // `date` is `YYYY-MM-DD`, so the range is a string comparison - and it uses
      // the { userId, date } index directly, with no conversion.
      const dateFilter = {
        ...(filter.from ? { $gte: filter.from } : {}),
        ...(filter.to ? { $lte: filter.to } : {}),
      };
      const query: Filter<ExpenseDoc> = {
        userId,
        ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {}),
        ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
      };
      return collections.expenses
        .find(query)
        .sort({ date: -1, createdAt: -1 })
        .limit(filter.limit)
        .toArray();
    },

    findById: (id) => collections.expenses.findOne({ _id: id, userId }),

    async insert(doc) {
      await collections.expenses.insertOne(doc);
    },

    update: (id, changes) =>
      collections.expenses.findOneAndUpdate(
        { _id: id, userId },
        { $set: changes },
        { returnDocument: 'after' },
      ),

    remove: (id) => collections.expenses.findOneAndDelete({ _id: id, userId }),

    countInRange: (from, to) =>
      // Only the rows that have NO base value: an expense whose rate could not
      // be fetched is reported separately rather than added at face value, which
      // would silently mix currencies into one number.
      collections.expenses.countDocuments({
        userId,
        date: { $gte: from, $lte: to },
        baseCents: null,
      }),

    async totalsByCategory(from, to): Promise<CategoryTotalRow[]> {
      const rows = await collections.expenses
        .aggregate<{ _id: ObjectId; totalCents: number; count: number }>([
          { $match: { userId, date: { $gte: from, $lte: to }, baseCents: { $ne: null } } },
          {
            $group: {
              _id: '$categoryId',
              totalCents: { $sum: '$baseCents' },
              count: { $sum: 1 },
            },
          },
        ])
        .toArray();
      return rows.map((row) => ({
        categoryId: row._id,
        totalCents: row.totalCents,
        count: row.count,
      }));
    },

    async totalsByMonth(from, to): Promise<MonthTotalRow[]> {
      const rows = await collections.expenses
        .aggregate<{ _id: string; totalCents: number; count: number }>([
          { $match: { userId, date: { $gte: from, $lte: to }, baseCents: { $ne: null } } },
          {
            // `date` is `YYYY-MM-DD`, so the month is the first seven characters -
            // no date parsing, no timezone, and the match still uses the
            // { userId, date } index.
            $group: {
              _id: { $substrBytes: ['$date', 0, 7] },
              totalCents: { $sum: '$baseCents' },
              count: { $sum: 1 },
            },
          },
        ])
        .toArray();
      return rows.map((row) => ({ month: row._id, totalCents: row.totalCents, count: row.count }));
    },
  };

  const categories: CategoryRepository = {
    list: () => collections.categories.find({ userId }).sort({ name: 1 }).toArray(),

    async insert(doc) {
      await collections.categories.insertOne(doc);
    },

    async exists(id) {
      const found = await collections.categories.findOne(
        { _id: id, userId },
        { projection: { _id: 1 } },
      );
      return found !== null;
    },
  };

  const budgets: BudgetRepository = {
    list: () => collections.budgets.find({ userId }).toArray(),

    set(categoryId, limitCents) {
      const now = new Date();
      return collections.budgets.findOneAndUpdate(
        { userId, categoryId },
        {
          $set: { limitCents, updatedAt: now },
          $setOnInsert: { _id: new ObjectId(), userId, categoryId, createdAt: now },
        },
        { upsert: true, returnDocument: 'after' },
      );
    },

    async remove(categoryId) {
      const result = await collections.budgets.deleteOne({ userId, categoryId });
      return result.deletedCount > 0;
    },
  };

  const receipts: ReceiptRepository = {
    findById: (id) => collections.receipts.findOne({ _id: id, userId }),

    async insert(doc) {
      await collections.receipts.insertOne(doc);
    },

    async claim(id) {
      const result = await collections.receipts.findOneAndUpdate(
        { _id: id, userId },
        { $unset: { expiresAt: '' } },
        { returnDocument: 'after' },
      );
      return result !== null;
    },

    async remove(id) {
      await collections.receipts.deleteOne({ _id: id, userId });
    },
  };

  const user: UserRepository = {
    find: () => collections.users.findOne({ _id: userId }),

    updatePreferences: (changes) =>
      collections.users.findOneAndUpdate(
        { _id: userId },
        { $set: changes },
        { returnDocument: 'after' },
      ),
  };

  return { expenses, categories, budgets, receipts, user };
}
