import type { ObjectId } from 'mongodb';
import type { BudgetDoc, CategoryDoc, ExpenseDoc, RateDoc, ReceiptDoc, UserDoc } from '../types.js';

export type ExpenseListFilter = {
  readonly from?: string | undefined;
  readonly to?: string | undefined;
  readonly categoryId?: ObjectId | undefined;
  readonly limit: number;
};

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
  remove(id: ObjectId): Promise<ExpenseDoc | null>;
  countUnconverted(from: string, to: string): Promise<number>;
  countByCategory(categoryId: ObjectId): Promise<number>;
  totalsByCategory(from: string, to: string): Promise<CategoryTotalRow[]>;
  totalsByMonth(from: string, to: string): Promise<MonthTotalRow[]>;
};

export type CategoryRepository = {
  list(): Promise<CategoryDoc[]>;
  findById(id: ObjectId): Promise<CategoryDoc | null>;
  insert(doc: CategoryDoc): Promise<void>;
  exists(id: ObjectId): Promise<boolean>;
  rename(id: ObjectId, name: string, nameKey: string): Promise<CategoryDoc | null>;
  remove(id: ObjectId): Promise<boolean>;
};

export type BudgetRepository = {
  list(): Promise<BudgetDoc[]>;
  set(categoryId: ObjectId, limitCents: number): Promise<BudgetDoc | null>;
  remove(categoryId: ObjectId): Promise<boolean>;
};

export type ReceiptRepository = {
  findById(id: ObjectId): Promise<ReceiptDoc | null>;
  insert(doc: ReceiptDoc): Promise<void>;
  claim(id: ObjectId): Promise<boolean>;
  remove(id: ObjectId): Promise<void>;
};

export type RateRepository = {
  find(key: string): Promise<RateDoc | null>;
  save(doc: RateDoc): Promise<void>;
};

export type AccountRepository = {
  findByEmail(email: string): Promise<UserDoc | null>;
  create(user: UserDoc, categories: readonly CategoryDoc[]): Promise<void>;
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
  readonly rates: RateRepository;
};
