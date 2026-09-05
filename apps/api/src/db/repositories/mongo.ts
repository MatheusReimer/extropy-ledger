import { ObjectId, type Filter } from 'mongodb';
import { getCollections } from '../client.js';
import type { CategoryDoc, ExpenseDoc, UserDoc } from '../types.js';
import { toObjectId } from '../../lib/ids.js';
import type {
  AccountRepository,
  BudgetRepository,
  CategoryRepository,
  CategoryTotalRow,
  ExpenseListFilter,
  ExpenseRepository,
  MonthTotalRow,
  RateRepository,
  ReceiptRepository,
  Repositories,
  UserRepository,
} from './types.js';

export async function repositoriesFor(userIdHex: string): Promise<Repositories> {
  const collections = await getCollections();
  const userId = toObjectId(userIdHex);

  const expenses: ExpenseRepository = {
    async list(filter: ExpenseListFilter) {
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

    countByCategory: (categoryId) => collections.expenses.countDocuments({ userId, categoryId }),

    countUnconverted: (from, to) =>
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

    findById: (id) => collections.categories.findOne({ _id: id, userId }),

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

    rename: (id, name, nameKey) =>
      collections.categories.findOneAndUpdate(
        { _id: id, userId },
        { $set: { name, nameKey } },
        { returnDocument: 'after' },
      ),

    async remove(id) {
      const result = await collections.categories.deleteOne({ _id: id, userId });
      return result.deletedCount > 0;
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

  const rates: RateRepository = {
    find: (key) => collections.rates.findOne({ _id: key }),

    async save(doc) {
      const { _id, ...fields } = doc;
      await collections.rates.updateOne({ _id }, { $set: fields }, { upsert: true });
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

  return { expenses, categories, budgets, receipts, user, rates };
}

export async function accountRepository(): Promise<AccountRepository> {
  const collections = await getCollections();

  return {
    findByEmail: (email) => collections.users.findOne({ email }),

    async create(user: UserDoc, categories: readonly CategoryDoc[]) {
      await collections.users.insertOne(user);
      if (categories.length > 0) await collections.categories.insertMany([...categories]);
    },
  };
}
