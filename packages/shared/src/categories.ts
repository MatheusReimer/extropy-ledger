/**
 * Categories seeded for every new account at signup.
 *
 * They live in `shared` because three consumers need the SAME list: the backend
 * seed, the frontend dropdowns, and the AI categorizer's prompt (the model may
 * only pick a category that actually exists).
 */
export const PREDEFINED_CATEGORIES = [
  'Groceries',
  'Dining',
  'Transport',
  'Housing',
  'Utilities',
  'Health',
  'Entertainment',
  'Shopping',
  'Travel',
  'Education',
  'Other',
] as const;

export type PredefinedCategory = (typeof PREDEFINED_CATEGORIES)[number];

/** Where categorization lands when the model fails or answers off-list. */
export const FALLBACK_CATEGORY: PredefinedCategory = 'Other';
