import {
  createExpenseSchema,
  listExpensesQuerySchema,
  sanitizeText,
  updateExpenseSchema,
  type ExpenseDto,
} from '@expense/shared';
import { ObjectId } from 'mongodb';
import { toExpenseDto } from '../db/mappers.js';
import { badRequest, notFound } from '../http/errors.js';
import type { AuthedHandler } from '../http/types.js';
import type { Repositories } from '../db/repositories/types.js';
import { parseInput } from '../http/validate.js';
import { toObjectId } from '../lib/ids.js';
import type { CurrencyCode } from '@expense/shared';
import { claimReceipt } from './receipts.js';
import { toBaseCents } from '../lib/rates.js';

async function assertCategoryOwned(
  categories: Repositories['categories'],
  categoryId: ObjectId,
): Promise<void> {
  if (!(await categories.exists(categoryId))) throw badRequest('Unknown category');
}

export const listExpenses: AuthedHandler = async (request) => {
  const query = parseInput(listExpensesQuerySchema, request.query);

  const docs = await request.repos.expenses.list({
    from: query.from,
    to: query.to,
    categoryId: query.categoryId ? toObjectId(query.categoryId, 'categoryId') : undefined,
    limit: query.limit,
  });

  const body: ExpenseDto[] = docs.map(toExpenseDto);
  return { status: 200, body };
};

export const createExpense: AuthedHandler = async (request) => {
  const input = parseInput(createExpenseSchema, request.body);
  const userId = toObjectId(request.userId);
  const categoryId = toObjectId(input.categoryId, 'categoryId');
  await assertCategoryOwned(request.repos.categories, categoryId);

  const receiptId = input.receiptId
    ? await claimReceipt(request.repos.receipts, toObjectId(input.receiptId, 'receiptId'))
    : undefined;

  const converted = await toBaseCents(
    input.amountCents,
    input.currency,
    input.date,
    request.repos.rates,
  );

  const now = new Date();
  const doc = {
    _id: new ObjectId(),
    userId,
    amountCents: input.amountCents,
    currency: input.currency,
    baseCents: converted?.baseCents ?? null,
    ...(converted ? { rate: converted.rate, rateAsOf: converted.asOf } : {}),
    description: sanitizeText(input.description),
    categoryId,
    date: input.date,
    createdAt: now,
    updatedAt: now,
    ...(receiptId ? { receiptId } : {}),
  };

  await request.repos.expenses.insert(doc);
  return { status: 201, body: toExpenseDto(doc) };
};

export const updateExpense: AuthedHandler = async (request) => {
  const input = parseInput(updateExpenseSchema, request.body);
  const expenseId = toObjectId(request.params['id'] ?? '');

  const categoryId = input.categoryId ? toObjectId(input.categoryId, 'categoryId') : undefined;
  if (categoryId) await assertCategoryOwned(request.repos.categories, categoryId);

  const existing = await request.repos.expenses.findById(expenseId);
  if (!existing) throw notFound('Expense not found');

  const touchesConversion =
    input.amountCents !== undefined || input.currency !== undefined || input.date !== undefined;
  const nextAmount = input.amountCents ?? existing.amountCents;
  const nextCurrency = (input.currency ?? existing.currency ?? 'USD') as CurrencyCode;
  const nextDate = input.date ?? existing.date;
  const converted = touchesConversion
    ? await toBaseCents(nextAmount, nextCurrency, nextDate, request.repos.rates)
    : undefined;

  const changes = {
    ...(input.amountCents === undefined ? {} : { amountCents: input.amountCents }),
    ...(input.currency === undefined ? {} : { currency: input.currency }),
    ...(input.description === undefined ? {} : { description: sanitizeText(input.description) }),
    ...(input.date === undefined ? {} : { date: input.date }),
    ...(categoryId ? { categoryId } : {}),
    ...(touchesConversion
      ? {
          baseCents: converted?.baseCents ?? null,
          rate: converted?.rate,
          rateAsOf: converted?.asOf,
        }
      : {}),
    updatedAt: new Date(),
  };
  const updated = await request.repos.expenses.update(expenseId, changes);
  if (!updated) throw notFound('Expense not found');
  return { status: 200, body: toExpenseDto(updated) };
};

export const deleteExpense: AuthedHandler = async (request) => {
  const removed = await request.repos.expenses.remove(toObjectId(request.params['id'] ?? ''));
  if (!removed) throw notFound('Expense not found');

  if (removed.receiptId) await request.repos.receipts.remove(removed.receiptId);

  return { status: 204 };
};
