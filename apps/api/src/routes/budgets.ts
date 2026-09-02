import { setBudgetSchema, type BudgetDto } from '@expense/shared';
import { toBudgetDto } from '../db/mappers.js';
import { notFound } from '../http/errors.js';
import type { AuthedHandler } from '../http/types.js';
import { parseInput } from '../http/validate.js';
import { toObjectId } from '../lib/ids.js';

export const listBudgets: AuthedHandler = async (request) => {
  const docs = await request.repos.budgets.list();
  const body: BudgetDto[] = docs.map(toBudgetDto);
  return { status: 200, body };
};

/**
 * Set or update the ceiling for one category.
 *
 * A PUT rather than a POST because it is idempotent: the same request twice
 * leaves the same single budget, which is what the repository's upsert against
 * the unique `(userId, categoryId)` index gives us without a read-then-write
 * race.
 */
export const setBudget: AuthedHandler = async (request) => {
  const input = parseInput(setBudgetSchema, request.body);
  const categoryId = toObjectId(request.params['categoryId'] ?? '', 'categoryId');

  // Budgeting against someone else's category is a 404, not a 403 - a 403 would
  // confirm the id exists. The repository is bound to this user, so `exists`
  // cannot answer for anyone else's categories.
  if (!(await request.repos.categories.exists(categoryId))) throw notFound('Category not found');

  const doc = await request.repos.budgets.set(categoryId, input.limitCents);
  if (!doc) throw notFound('Budget not found');
  return { status: 200, body: toBudgetDto(doc) };
};

export const deleteBudget: AuthedHandler = async (request) => {
  const categoryId = toObjectId(request.params['categoryId'] ?? '', 'categoryId');
  const removed = await request.repos.budgets.remove(categoryId);

  // Removing the row, not writing a zero: 0 is a legitimate budget meaning
  // "spend nothing here", so it cannot double as the absent value.
  if (!removed) throw notFound('Budget not found');
  return { status: 204 };
};
