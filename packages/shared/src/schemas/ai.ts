import { z } from 'zod';
import { descriptionSchema, amountCentsSchema } from './expense.js';

export const categorizeRequestSchema = z.object({
  description: descriptionSchema,
  amountCents: amountCentsSchema.optional(),
});

export const CATEGORIZE_SOURCES = ['rule', 'model', 'fallback'] as const;
export type CategorizeSource = (typeof CATEGORIZE_SOURCES)[number];

export type CategorizeResult = {
  category: string;
  confidence: number;
  source: CategorizeSource;
};

export type CategorizeInput = z.infer<typeof categorizeRequestSchema>;
