import type { ObjectId } from 'mongodb';
import type { BudgetDoc, CategoryDoc, ExpenseDoc, ReceiptDoc, UserDoc } from '../types.js';

/**
 * The persistence surface, as the routes see it.
 *
 * Note what is missing from every signature below: `userId`. Each repository is
 * built already bound to one authenticated user, so a route cannot write an
 * unscoped query even by accident - there is no parameter through which to omit
 * the scope.
 *
 * That matters more than it looks. Scoping every query by `userId` IN THE FILTER
 * is the whole defence against IDOR (OWASP A01), and before this layer existed
 * it was enforced by fifteen separate correct usages across the route files. One
 * new route that forgot would have been a cross-tenant data leak that no test
 * caught. Here forgetting is not expressible.
 *
 * The second reason is testing. Routes depend on these interfaces rather than on
 * MongoDB, so a handler can be exercised against an in-memory fake - which is
 * how the route tests run without a database.
 */

export type ExpenseListFilter = {
  readonly from?: string | undefined;
  readonly to?: string | undefined;
  readonly categoryId?: ObjectId | undefined;
  readonly limit: number;
};

/**
 * One row of a `$group` over expenses, before it becomes a report.
 *
 * Named `...Row` rather than reusing the report's own `CategoryTotal` on
 * purpose: this is what the DATABASE returns (an ObjectId, no category name),
 * while the DTO is what the API returns. Letting one name mean both is how a
 * persistence detail ends up in a response.
 */
export type CategoryTotalRow = {
  readonly categoryId: ObjectId;
  readonly totalCents: number;
  readonly count: number;
};

export type MonthTotalRow = {
  readonly month: string;
  readonly totalCents: number;
  readonly count: number;
};

export type ExpenseRepository = {
  list(filter: ExpenseListFilter): Promise<ExpenseDoc[]>;
  findById(id: ObjectId): Promise<ExpenseDoc | null>;
  insert(doc: ExpenseDoc): Promise<void>;
  update(id: ObjectId, changes: Partial<ExpenseDoc>): Promise<ExpenseDoc | null>;
  /** Returns the deleted document, so the caller can clean up its receipt. */
  remove(id: ObjectId): Promise<ExpenseDoc | null>;
  countInRange(from: string, to: string): Promise<number>;
  /**
   * Totals grouped by category, summed in the database.
   *
   * Deliberately not "fetch the month and add it up in Node": that scales with
   * the user's volume, `$group` does not.
   */
  totalsByCategory(from: string, to: string): Promise<CategoryTotalRow[]>;
  totalsByMonth(from: string, to: string): Promise<MonthTotalRow[]>;
};

export type CategoryRepository = {
  list(): Promise<CategoryDoc[]>;
  insert(doc: CategoryDoc): Promise<void>;
  /** Ownership check for a referenced category - see `assertCategoryOwned`. */
  exists(id: ObjectId): Promise<boolean>;
};

export type BudgetRepository = {
  list(): Promise<BudgetDoc[]>;
  /** Upsert against the unique `(userId, categoryId)` index. */
  set(categoryId: ObjectId, limitCents: number): Promise<BudgetDoc | null>;
  remove(categoryId: ObjectId): Promise<boolean>;
};

export type ReceiptRepository = {
  findById(id: ObjectId): Promise<ReceiptDoc | null>;
  insert(doc: ReceiptDoc): Promise<void>;
  /** Unsets `expiresAt`, taking the receipt out of the TTL sweep for good. */
  claim(id: ObjectId): Promise<boolean>;
  remove(id: ObjectId): Promise<void>;
};

export type UserRepository = {
  find(): Promise<UserDoc | null>;
  updatePreferences(changes: Partial<UserDoc>): Promise<UserDoc | null>;
};

export type Repositories = {
  readonly expenses: ExpenseRepository;
  readonly categories: CategoryRepository;
  readonly budgets: BudgetRepository;
  readonly receipts: ReceiptRepository;
  readonly user: UserRepository;
};
