import { Type, type Schema } from '@google/genai';

/**
 * The extraction contract - a wider cousin of the categorisation schema.
 *
 * Every string field allows "" rather than being optional, because a model given
 * an optional field will sometimes omit it and sometimes invent it. Forcing a
 * value and defining the empty string as "not found" makes "I could not read
 * this" a first-class answer instead of a missing key.
 */
export function geminiReceiptSchema(categories: readonly string[]): Schema {
  return {
    type: Type.OBJECT,
    properties: {
      merchant: {
        type: Type.STRING,
        description: 'Who was paid, as printed. Empty string if not stated.',
      },
      description: {
        type: Type.STRING,
        description:
          'What was bought, in at most six words - the kind of note a person writes in a ledger, such as "dinner for two" or "weekly groceries". Never a list of the line items.',
      },
      amount: {
        type: Type.STRING,
        description:
          'The final total charged, as digits with a dot decimal separator and nothing else - no currency symbol, no thousands separator. Empty string if no total can be read.',
      },
      currency: {
        type: Type.STRING,
        description: 'ISO 4217 code such as USD or BRL. Empty string if not printed.',
      },
      date: {
        type: Type.STRING,
        description: 'Transaction date as YYYY-MM-DD. Empty string if not printed.',
      },
      /**
       * No empty option here: Gemini rejects an empty string inside an enum
       * ("enum[0]: cannot be empty"). It needs none - every account has an
       * "Other" category, which is already this domain's word for "nothing
       * fits", so the vocabulary carries the meaning instead of a sentinel.
       */
      category: {
        type: Type.STRING,
        enum: [...categories],
        description: 'Best matching category. Use Other when nothing fits.',
      },
      confidence: {
        type: Type.NUMBER,
        description:
          'Zero to one. Below 0.5 when the document is unclear, cropped, or is not a receipt at all.',
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

/**
 * The amount instruction carries the weight here.
 *
 * A receipt is full of numbers that are not the answer: line items, subtotals,
 * tax lines, "amount tendered", change given. Naming the target precisely is
 * what separates 240.45 from the 229.00 subtotal directly above it on the page.
 */
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
