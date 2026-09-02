import type { Binary, ObjectId } from 'mongodb';

export type UserDoc = {
  _id: ObjectId;
  email: string;
  passwordHash: string;
  createdAt: Date;
  /** Display preferences. Absent on accounts created before they existed. */
  displayCurrency?: string | undefined;
  locale?: string | undefined;
};

export type CategoryDoc = {
  _id: ObjectId;
  userId: ObjectId;
  name: string;
  /** Lowercased `name` - the unique-index key, so "Pets" and "pets" collide. */
  nameKey: string;
  isCustom: boolean;
  createdAt: Date;
};

/**
 * One monthly ceiling, per user per category.
 *
 * `limitCents` is in the BASE currency for the same reason `baseCents` is: it is
 * compared against the report's sums, and the comparison should not depend on an
 * exchange-rate call succeeding. Deleting the budget removes the row rather than
 * writing a zero - 0 means "spend nothing here", which is a real budget.
 */
export type BudgetDoc = {
  _id: ObjectId;
  userId: ObjectId;
  categoryId: ObjectId;
  limitCents: number;
  createdAt: Date;
  updatedAt: Date;
};

export type ExpenseDoc = {
  _id: ObjectId;
  userId: ObjectId;
  /** As spent, in `currency`. Never mutated - rates change, this does not. */
  amountCents: number;
  currency: string;
  /**
   * The amount in the base currency at the TRANSACTION-DATE rate.
   *
   * Stored rather than computed because a historical rate is immutable: it will
   * read the same in five years. That is what keeps the monthly report a plain
   * `$sum` in the database instead of a per-row conversion in Node.
   */
  baseCents: number | null;
  /** The rate used and the day it is from, kept for auditability. */
  rate?: number | undefined;
  rateAsOf?: string | undefined;
  description: string;
  categoryId: ObjectId;
  /** `YYYY-MM-DD`. Lexicographic comparison is chronological comparison. */
  date: string;
  createdAt: Date;
  updatedAt: Date;
  /** Set when the expense was created from an uploaded receipt. */
  receiptId?: ObjectId | undefined;
};

/**
 * The uploaded file, kept so an expense can show its own receipt later.
 *
 * Stored in Mongo rather than S3 on purpose. A bucket would mean IAM, a
 * lifecycle policy, presigned URLs and CORS on a second origin - real work, all
 * of it to hold documents capped at 4 MB, comfortably under the 16 MB BSON
 * limit. The trade-off is that the free 512 MB cluster puts a real ceiling on
 * how many receipts fit, which is the right constraint to accept for an MVP and
 * the wrong one for production. Noted in the README.
 */
export type ReceiptDoc = {
  _id: ObjectId;
  userId: ObjectId;
  /** The SNIFFED type, never the one the browser claimed. */
  mimeType: string;
  fileName: string;
  bytes: number;
  data: Binary;
  createdAt: Date;
  /**
   * Set on upload, cleared once an expense claims it.
   *
   * A TTL index on this field sweeps away receipts from uploads the user never
   * saved - abandoning a half-filled form is the common case, and without this
   * every abandoned draft would leak a megabyte into a 512 MB cluster forever.
   */
  expiresAt?: Date | undefined;
};

/**
 * A cached exchange rate.
 *
 * `_id` is `date:from:to`, so a lookup is a primary-key hit. Dated rates never
 * expire because they cannot change; only "latest" carries an `expiresAt`.
 */
export type RateDoc = {
  _id: string;
  rate: number;
  asOf: string;
  fetchedAt: Date;
  expiresAt?: Date | undefined;
};
