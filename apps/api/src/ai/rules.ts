import type { PredefinedCategory } from '@expense/shared';
import { normalizeDescription } from './normalize.js';

type Rule = {
  readonly category: PredefinedCategory;
  readonly words?: readonly string[];
  readonly phrases?: readonly string[];
};

const RULES: readonly Rule[] = [
  {
    category: 'Dining',
    words: [
      'starbucks',
      'mcdonalds',
      'restaurant',
      'cafe',
      'coffee',
      'pizza',
      'bar',
      'brunch',
      'chipotle',
    ],
    phrases: ['uber eats', 'door dash', 'doordash', 'burger king', 'fast food', 'food delivery'],
  },
  {
    category: 'Food',
    words: [
      'grocery',
      'groceries',
      'supermarket',
      'aldi',
      'kroger',
      'walmart',
      'costco',
      'safeway',
      'publix',
    ],
    phrases: ['whole foods', 'trader joes', 'farmers market'],
  },
  {
    category: 'Transport',
    words: [
      'uber',
      'lyft',
      'taxi',
      'gas',
      'fuel',
      'parking',
      'metro',
      'bus',
      'train',
      'toll',
      'shell',
      'chevron',
    ],
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
    words: [
      'pharmacy',
      'doctor',
      'dentist',
      'hospital',
      'clinic',
      'therapy',
      'walgreens',
      'cvs',
      'gym',
      'medication',
    ],
    phrases: ['health insurance', 'urgent care', 'eye exam'],
  },
  {
    category: 'Entertainment',
    words: [
      'netflix',
      'spotify',
      'cinema',
      'movie',
      'movies',
      'concert',
      'steam',
      'hulu',
      'disney',
      'playstation',
      'xbox',
    ],
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
