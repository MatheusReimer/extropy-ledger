import type { BudgetDto, CategoryDto, ExpenseDto, UserDto } from '@expense/shared';
import type { BudgetDoc, CategoryDoc, ExpenseDoc, UserDoc } from './types.js';

/**
 * The single boundary between a document and a DTO.
 *
 * Serialising the raw document would ship `passwordHash` to the client the day
 * someone returns a whole user object. One explicit mapper per collection makes
 * that leak impossible by construction rather than by remembering.
 */
export const toUserDto = (doc: UserDoc): UserDto => ({
  id: doc._id.toHexString(),
  email: doc.email,
  // Defaults live here rather than in the schema, so accounts created before
  // these fields existed keep working without a migration.
  displayCurrency: doc.displayCurrency ?? 'USD',
  locale: doc.locale ?? 'en',
});

export const toCategoryDto = (doc: CategoryDoc): CategoryDto => ({
  id: doc._id.toHexString(),
  name: doc.name,
  isCustom: doc.isCustom,
});

export const toBudgetDto = (doc: BudgetDoc): BudgetDto => ({
  categoryId: doc.categoryId.toHexString(),
  limitCents: doc.limitCents,
});

export const toExpenseDto = (doc: ExpenseDoc): ExpenseDto => ({
  id: doc._id.toHexString(),
  amountCents: doc.amountCents,
  currency: doc.currency ?? 'USD',
  baseCents: doc.baseCents ?? null,
  description: doc.description,
  categoryId: doc.categoryId.toHexString(),
  date: doc.date,
  createdAt: doc.createdAt.toISOString(),
  ...(doc.receiptId ? { receiptId: doc.receiptId.toHexString() } : {}),
});
