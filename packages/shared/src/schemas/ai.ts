import { z } from 'zod';
import { descriptionSchema, amountCentsSchema } from './expense.js';

export const categorizeRequestSchema = z.object({
  description: descriptionSchema,
  amountCents: amountCentsSchema.optional(),
});

/**
 * `source` is part of the contract on purpose: the UI tells the user where a
 * suggestion came from, and the README uses the same distinction to argue about
 * when an AI call is worth making. `rule` never touched the model; `fallback`
 * means the model was asked and did not answer usefully.
 */
export const CATEGORIZE_SOURCES = ['rule', 'model', 'fallback'] as const;
export type CategorizeSource = (typeof CATEGORIZE_SOURCES)[number];

export type CategorizeResult = {
  category: string;
  confidence: number;
  source: CategorizeSource;
};

export type CategorizeInput = z.infer<typeof categorizeRequestSchema>;
