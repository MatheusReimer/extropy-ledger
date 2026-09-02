import { PREDEFINED_CATEGORIES, type PredefinedCategory } from '@expense/shared';
import { normalizeDescription } from './normalize.js';

/**
 * Deterministic pre-pass: most expenses never reach the model at all.
 *
 * "Starbucks" is not a natural-language problem - it is a table lookup. Spending
 * 300 ms and a paid API call to learn that coffee is Dining is using AI where
 * `Set.has` already answers. The model is reserved for the case it genuinely
 * wins: an ambiguous description, an unknown merchant, free-form text.
 *
 * It also buys two things the UI uses directly: an instant answer in the common
 * case, and an honest `source` on the response.
 */
type Rule = {
  readonly category: PredefinedCategory;
  /** Single word: matched as an exact token, so "art" cannot match inside "cart". */
  readonly words?: readonly string[];
  /** Two or more words: matched as a substring, and evaluated BEFORE any word. */
  readonly phrases?: readonly string[];
};

const RULES: readonly Rule[] = [
  {
    category: 'Dining',
    words: ['starbucks', 'mcdonalds', 'restaurant', 'cafe', 'coffee', 'pizza', 'bar', 'brunch', 'chipotle'],
    phrases: ['uber eats', 'door dash', 'doordash', 'burger king', 'fast food', 'food delivery'],
  },
  {
    category: 'Groceries',
    words: ['grocery', 'groceries', 'supermarket', 'aldi', 'kroger', 'walmart', 'costco', 'safeway', 'publix'],
    phrases: ['whole foods', 'trader joes', 'farmers market'],
  },
  {
    category: 'Transport',
    words: ['uber', 'lyft', 'taxi', 'gas', 'fuel', 'parking', 'metro', 'bus', 'train', 'toll', 'shell', 'chevron'],
    phrases: ['gas station', 'car wash', 'oil change'],
  },
  {
    category: 'Housing',
    words: ['rent', 'mortgage', 'hoa', 'landlord'],
    phrases: ['property tax', 'home insurance', 'home repair'],
  },
  {
    category: 'Utilities',
    words: ['electricity', 'electric', 'water', 'internet', 'wifi', 'phone', 'comcast', 'verizon'],
    phrases: ['power bill', 'utility bill', 'cell phone', 'trash pickup'],
  },
  {
    category: 'Health',
    words: ['pharmacy', 'doctor', 'dentist', 'hospital', 'clinic', 'therapy', 'walgreens', 'cvs', 'gym', 'medication'],
    phrases: ['health insurance', 'urgent care', 'eye exam'],
  },
  {
    category: 'Entertainment',
    words: ['netflix', 'spotify', 'cinema', 'movie', 'movies', 'concert', 'steam', 'hulu', 'disney', 'playstation', 'xbox'],
    phrases: ['video game', 'prime video', 'apple music'],
  },
  {
    category: 'Shopping',
    words: ['amazon', 'target', 'clothes', 'clothing', 'shoes', 'ikea', 'nike', 'etsy', 'zara'],
    phrases: ['best buy', 'home depot', 'online order'],
  },
  {
    category: 'Travel',
    words: ['flight', 'airline', 'hotel', 'airbnb', 'delta', 'united', 'hostel', 'expedia'],
    phrases: ['plane ticket', 'car rental', 'travel insurance', 'baggage fee'],
  },
  {
    category: 'Education',
    words: ['tuition', 'course', 'udemy', 'coursera', 'textbook', 'school', 'university'],
    phrases: ['online course', 'student loan', 'school supplies'],
  },
];

export const RULE_CONFIDENCE = 0.95;

/**
 * Phrases first, for a concrete reason: "uber eats" contains "uber". Matching by
 * word first would file a dinner under Transport at 95% confidence - and a
 * confident wrong answer is worse than no suggestion at all.
 */
export function matchRule(description: string): PredefinedCategory | undefined {
  const normalized = normalizeDescription(description);
  if (!normalized) return undefined;

  const padded = ` ${normalized} `;
  for (const rule of RULES) {
    if (rule.phrases?.some((phrase) => padded.includes(` ${phrase} `))) return rule.category;
  }

  const tokens = new Set(normalized.split(' '));
  for (const rule of RULES) {
    if (rule.words?.some((word) => tokens.has(word))) return rule.category;
  }

  return undefined;
}

/** Used by tests to assert every rule points at a category that actually exists. */
export const ruleCategories = (): readonly PredefinedCategory[] =>
  RULES.map((rule) => rule.category).filter((category) => PREDEFINED_CATEGORIES.includes(category));
