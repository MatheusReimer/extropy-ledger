import { z } from 'zod';

export const CATEGORY_NAME_MAX = 40;

export const categoryNameSchema = z
  .string()
  .trim()
  .min(1, 'Category name is required')
  .max(CATEGORY_NAME_MAX, `Category name must be at most ${CATEGORY_NAME_MAX} characters`);

export const createCategorySchema = z.object({
  name: categoryNameSchema,
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
