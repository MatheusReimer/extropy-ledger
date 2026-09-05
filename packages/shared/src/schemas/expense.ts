import { z } from 'zod';
import { CURRENCIES } from '../currency.js';

export const DESCRIPTION_MAX = 200;

export const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'Date is not a real date');

export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must be YYYY-MM');

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
  currency: z.enum(CURRENCIES).default('USD'),
  receiptId: objectIdSchema.optional(),
});

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

export const trendQuerySchema = z.object({
  to: monthSchema,
  months: z.coerce.number().int().min(2).max(12).default(6),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
