/**
 * The shape of each resource as it leaves the API and enters the frontend.
 *
 * These are not the Mongo documents: `_id` becomes a string `id`, `Date` becomes
 * ISO, and nothing sensitive (passwordHash) exists here at all. The frontend
 * imports these types directly — one contract, both sides, no duplication and no
 * codegen step.
 */

export type CategoryDto = {
  id: string;
  name: string;
  isCustom: boolean;
};

export type ExpenseDto = {
  id: string;
  /** As spent, in `currency`. The source of truth; never a converted value. */
  amountCents: number;
  currency: string;
  /**
   * The same amount in the base currency, at the rate on the day it happened.
   *
   * Null when no rate could be obtained. A null is an honest "not converted";
   * substituting the unconverted number would silently claim a wrong total.
   */
  baseCents: number | null;
  description: string;
  categoryId: string;
  date: string;
  createdAt: string;
  /** Present when this expense was created from an uploaded receipt. */
  receiptId?: string;
};

/** A stored receipt, returned base64-encoded - see the route for why. */
export type ReceiptDto = {
  id: string;
  mimeType: string;
  fileName: string;
  data: string;
};

export type UserDto = {
  id: string;
  email: string;
  /** What the user wants to READ amounts in. Never changes what was stored. */
  displayCurrency: string;
  locale: string;
};

export type AuthResponse = {
  token: string;
  user: UserDto;
};

/**
 * A user's monthly ceiling for one category, in the base currency.
 *
 * Absent from the list entirely when unset - there is no "no budget" sentinel
 * value, because 0 is a legitimate budget ("spend nothing here").
 */
export type BudgetDto = {
  categoryId: string;
  limitCents: number;
};

export type CategoryBreakdown = {
  categoryId: string;
  name: string;
  totalCents: number;
  count: number;
};

export type MonthlySummary = {
  month: string;
  /** In the base currency. The client converts once, for display. */
  totalCents: number;
  expenseCount: number;
  byCategory: CategoryBreakdown[];
  /**
   * Expenses excluded because no rate was available.
   *
   * Surfaced rather than hidden: a total quietly missing two entries is a bug
   * the user cannot see, and a report that under-reports is worse than one that
   * admits a gap.
   */
  unconvertedCount: number;
};

/** One bar of the trend chart. Months with no expenses are present, at zero. */
export type MonthlyTrendPoint = {
  month: string;
  totalCents: number;
  expenseCount: number;
};

/** Uniform API error body — the frontend can always rely on this shape. */
export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    /** Present only on 422: field -> first validation message. */
    fields?: Record<string, string>;
  };
};
