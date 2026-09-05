export const PREDEFINED_CATEGORIES = [
  'Food',
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

export const FALLBACK_CATEGORY: PredefinedCategory = 'Other';
