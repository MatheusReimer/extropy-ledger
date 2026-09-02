import { z } from 'zod';
import { CURRENCIES } from '../currency.js';

export const DESCRIPTION_MAX = 200;

/** Mongo ids travel as 24-char hex. Validating here avoids a pointless round-trip. */
export const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

/**
 * Dates are `YYYY-MM-DD`, not instants.
 *
 * An expense happens on a DAY, not at a microsecond. Storing a `Date` would
 * force us to pick a timezone to cut the month on for reports, and the cut would
 * move depending on where the server runs. A date string removes the entire
 * class of timezone bugs.
 */
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'Date is not a real date');

/** Report month: `YYYY-MM`. */
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must be YYYY-MM');

/**
 * Money travels as an integer number of cents — see `money.ts` for why. The
 * ceiling (one trillion cents) keeps aggregate sums inside
 * Number.MAX_SAFE_INTEGER even with a large number of expenses.
 */
export const amountCentsSchema = z
  .number()
  .int('Amount must be a whole number of cents')
  .positive('Amount must be greater than zero')
  .max(1_000_000_000_000, 'Amount is too large');

export const descriptionSchema = z
  .string()
  .trim()
  .min(1, 'Description is required')
  .max(DESCRIPTION_MAX, `Description must be at most ${DESCRIPTION_MAX} characters`);

export const createExpenseSchema = z.object({
  amountCents: amountCentsSchema,
  description: descriptionSchema,
  categoryId: objectIdSchema,
  date: dateSchema,
  /**
   * The currency as SPENT, not as displayed.
   *
   * Defaults to USD so every existing caller keeps working and a single-currency
   * user never has to think about it.
   */
  currency: z.enum(CURRENCIES).default('USD'),
  /** Claims a previously uploaded receipt. Ownership is checked server-side. */
  receiptId: objectIdSchema.optional(),
});

/** Partial PATCH: at least one field, otherwise the request is a no-op. */
export const updateExpenseSchema = createExpenseSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

export const listExpensesQuerySchema = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  categoryId: objectIdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export const summaryQuerySchema = z.object({
  month: monthSchema,
});

/**
 * A window of months ending at `to`.
 *
 * Anchored to the selected month rather than to today, so the chart follows the
 * month picker instead of silently disagreeing with the figures beside it. The
 * cap matches the picker's own twelve options.
 */
export const trendQuerySchema = z.object({
  to: monthSchema,
  months: z.coerce.number().int().min(2).max(12).default(6),
});

export type TrendQuery = z.infer<typeof trendQuerySchema>;

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type ListExpensesQuery = z.infer<typeof listExpensesQuerySchema>;
export type SummaryQuery = z.infer<typeof summaryQuerySchema>;
