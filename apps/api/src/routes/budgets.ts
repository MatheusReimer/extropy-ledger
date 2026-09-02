import { setBudgetSchema, type BudgetDto } from '@expense/shared';
import { ObjectId } from 'mongodb';
import { getCollections } from '../db/client.js';
import { toBudgetDto } from '../db/mappers.js';
import { notFound } from '../http/errors.js';
import type { AuthedHandler } from '../http/types.js';
import { parseInput } from '../http/validate.js';
import { toObjectId } from '../lib/ids.js';

export const listBudgets: AuthedHandler = async (request) => {
  const { budgets } = await getCollections();
  const docs = await budgets.find({ userId: toObjectId(request.userId) }).toArray();

  const body: BudgetDto[] = docs.map(toBudgetDto);
  return { status: 200, body };
};

/**
 * Set or update the ceiling for one category.
 *
 * A PUT rather than a POST because it is idempotent: the same request twice
 * leaves the same single budget, which is what an upsert against the unique
 * `(userId, categoryId)` index gives us without a read-then-write race.
 */
export const setBudget: AuthedHandler = async (request) => {
  const input = parseInput(setBudgetSchema, request.body);
  const categoryId = toObjectId(request.params['categoryId'] ?? '');
  const userId = toObjectId(request.userId);
  const { budgets, categories } = await getCollections();

  // Scoped by userId in the FILTER, so budgeting against someone else's category
  // is a 404 rather than a 403 - a 403 would confirm the id exists.
  const category = await categories.findOne({ _id: categoryId, userId });
  if (!category) throw notFound('Category not found');

  const now = new Date();
  const doc = await budgets.findOneAndUpdate(
    { userId, categoryId },
    {
      $set: { limitCents: input.limitCents, updatedAt: now },
      $setOnInsert: { _id: new ObjectId(), userId, categoryId, createdAt: now },
    },
    { upsert: true, returnDocument: 'after' },
  );

  if (!doc) throw notFound('Budget not found');
  return { status: 200, body: toBudgetDto(doc) };
};

export const deleteBudget: AuthedHandler = async (request) => {
  const { budgets } = await getCollections();

  const result = await budgets.deleteOne({
    userId: toObjectId(request.userId),
    categoryId: toObjectId(request.params['categoryId'] ?? ''),
  });

  // Removing the row, not writing a zero: 0 is a legitimate budget meaning
  // "spend nothing here", so it cannot double as the absent value.
  if (result.deletedCount === 0) throw notFound('Budget not found');
  return { status: 204 };
};
