import { Type, type Schema } from '@google/genai';

const FIELD_DESCRIPTIONS = {
  merchant: 'Who was paid, as printed. Empty string if not stated.',
  description:
    'What was bought, in at most six words - the kind of note a person writes in a ledger, such as "dinner for two" or "weekly groceries". Never a list of the line items.',
  amount:
    'The final total charged, as digits with a dot decimal separator and nothing else - no currency symbol, no thousands separator. Empty string if no total can be read.',
  currency: 'ISO 4217 code such as USD or BRL. Empty string if not printed.',
  date: 'Transaction date as YYYY-MM-DD. Empty string if not printed.',
  category: 'Best matching category. Use Other when nothing fits.',
  confidence:
    'Zero to one. Below 0.5 when the document is unclear, cropped, or is not a receipt at all.',
} as const;

export function geminiReceiptSchema(categories: readonly string[]): Schema {
  return {
    type: Type.OBJECT,
    properties: {
      merchant: {
        type: Type.STRING,
        description: FIELD_DESCRIPTIONS.merchant,
      },
      description: {
        type: Type.STRING,
        description: FIELD_DESCRIPTIONS.description,
      },
      amount: {
        type: Type.STRING,
        description: FIELD_DESCRIPTIONS.amount,
      },
      currency: {
        type: Type.STRING,
        description: FIELD_DESCRIPTIONS.currency,
      },
      date: {
        type: Type.STRING,
        description: FIELD_DESCRIPTIONS.date,
      },
      category: {
        type: Type.STRING,
        enum: [...categories],
        description: FIELD_DESCRIPTIONS.category,
      },
      confidence: {
        type: Type.NUMBER,
        description: FIELD_DESCRIPTIONS.confidence,
      },
    },
    required: ['merchant', 'description', 'amount', 'currency', 'date', 'category', 'confidence'],
    propertyOrdering: [
      'merchant',
      'description',
      'amount',
      'currency',
      'date',
      'category',
      'confidence',
    ],
  };
}

export function buildReceiptSystemPrompt(categories: readonly string[]): string {
  return [
    'You read a receipt or invoice image and extract a single expense from it.',
    `Allowed categories: ${categories.join(', ')}.`,
    'amount is the FINAL total actually charged, after taxes, fees and discounts.',
    'It is never a line item, never a subtotal, and never the cash tendered.',
    'Use an empty string for any TEXT field the document does not clearly state. Never guess a value.',
    'Keep description to a handful of words. Listing every line item is wrong.',
    'For category, choose Other when nothing else fits.',
    'Report confidence below 0.5 when the document is unclear, cropped, or is not a receipt.',
  ].join('\n');
}

export function jsonReceiptSchema(categories: readonly string[]): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      merchant: { type: 'string', description: FIELD_DESCRIPTIONS.merchant },
      description: { type: 'string', description: FIELD_DESCRIPTIONS.description },
      amount: { type: 'string', description: FIELD_DESCRIPTIONS.amount },
      currency: { type: 'string', description: FIELD_DESCRIPTIONS.currency },
      date: { type: 'string', description: FIELD_DESCRIPTIONS.date },
      category: {
        type: 'string',
        enum: [...categories],
        description: FIELD_DESCRIPTIONS.category,
      },
      confidence: { type: 'number', description: FIELD_DESCRIPTIONS.confidence },
    },
    required: ['merchant', 'description', 'amount', 'currency', 'date', 'category', 'confidence'],
    additionalProperties: false,
  };
}
