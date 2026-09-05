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

export const setBudget: AuthedHandler = async (request) => {
  const input = parseInput(setBudgetSchema, request.body);
  const categoryId = toObjectId(request.params['categoryId'] ?? '', 'categoryId');

  if (!(await request.repos.categories.exists(categoryId))) throw notFound('Category not found');

  const doc = await request.repos.budgets.set(categoryId, input.limitCents);
  if (!doc) throw notFound('Budget not found');
  return { status: 200, body: toBudgetDto(doc) };
};

export const deleteBudget: AuthedHandler = async (request) => {
  const categoryId = toObjectId(request.params['categoryId'] ?? '', 'categoryId');
  const removed = await request.repos.budgets.remove(categoryId);

  if (!removed) throw notFound('Budget not found');
  return { status: 204 };
};
