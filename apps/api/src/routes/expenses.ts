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

/**
 * The category has to belong to THIS user.
 *
 * Without this check, posting another account's categoryId would succeed: the
 * expense would be created pointing at somebody else's category, and the report
 * would start showing a name its owner never created. A cross-tenant reference
 * is write-side IDOR.
 *
 * The repository is already bound to the caller, so `exists` cannot answer for
 * anybody else - the scope is not this function's to get wrong.
 */
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
  // Still needed to STAMP the document; reads are scoped by the repository.
  const userId = toObjectId(request.userId);
  const categoryId = toObjectId(input.categoryId, 'categoryId');
  await assertCategoryOwned(request.repos.categories, categoryId);

  // A receipt id from another account simply does not attach - the expense is
  // still created, minus the link. Refusing the whole write would let someone
  // probe for valid ids by watching which requests fail.
  const receiptId = input.receiptId
    ? await claimReceipt(request.repos.receipts, toObjectId(input.receiptId, 'receiptId'))
    : undefined;

  /**
   * Convert once, at write time, using the rate on the day it happened.
   *
   * That rate is a historical fact - it will read the same in five years - so
   * storing the result is not a value that decays, and it keeps the monthly
   * report a plain `$sum` rather than a per-row conversion.
   *
   * If no rate can be had, `baseCents` stays null and the expense is still
   * created. Blocking someone from recording what they spent because a third
   * party is down would be the wrong trade; the report says how many entries it
   * had to leave out.
   */
  const converted = await toBaseCents(input.amountCents, input.currency, input.date);

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

  /**
   * Re-convert when any input to the conversion changed.
   *
   * Amount, currency and date all feed the base value; leaving a stale
   * `baseCents` behind would make the row and the report disagree, which is the
   * hardest kind of bug to spot because both numbers look plausible.
   */
  const existing = await request.repos.expenses.findById(expenseId);
  if (!existing) throw notFound('Expense not found');

  const touchesConversion =
    input.amountCents !== undefined || input.currency !== undefined || input.date !== undefined;
  const nextAmount = input.amountCents ?? existing.amountCents;
  const nextCurrency = (input.currency ?? existing.currency ?? 'USD') as CurrencyCode;
  const nextDate = input.date ?? existing.date;
  const converted = touchesConversion
    ? await toBaseCents(nextAmount, nextCurrency, nextDate)
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
  // The repository puts `userId` in the FILTER, which is what turns an update
  // against someone else's expense into a 404 rather than a silent success.
  const updated = await request.repos.expenses.update(expenseId, changes);
  if (!updated) throw notFound('Expense not found');
  return { status: 200, body: toExpenseDto(updated) };
};

export const deleteExpense: AuthedHandler = async (request) => {
  const removed = await request.repos.expenses.remove(toObjectId(request.params['id'] ?? ''));
  if (!removed) throw notFound('Expense not found');

  // Deleting the expense deletes its document too. Keeping an orphaned image of
  // someone's restaurant bill after they asked for the record to go is the kind
  // of retention nobody agreed to.
  if (removed.receiptId) await request.repos.receipts.remove(removed.receiptId);

  return { status: 204 };
};
