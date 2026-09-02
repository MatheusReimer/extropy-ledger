import { Type, type Schema } from '@google/genai';

/**
 * The response contract, rendered once per provider dialect.
 *
 * Both providers are asked for the same two fields; they just disagree on how a
 * schema is spelled. Keeping the field descriptions here means the wording that
 * shapes the answer cannot drift between providers, which would make their
 * outputs quietly incomparable.
 */
const CATEGORY_DESCRIPTION = 'The single best category for this expense.';
const CONFIDENCE_DESCRIPTION =
  'How confident you are, from 0 to 1. Use a low value when the description is vague.';

/**
 * Gemini's own schema dialect.
 *
 * The `enum` here is enforced during decoding: the model is structurally unable
 * to emit a category outside this list.
 */
export function geminiResponseSchema(categories: readonly string[]): Schema {
  return {
    type: Type.OBJECT,
    properties: {
      category: { type: Type.STRING, enum: [...categories], description: CATEGORY_DESCRIPTION },
      confidence: { type: Type.NUMBER, description: CONFIDENCE_DESCRIPTION },
    },
    required: ['category', 'confidence'],
    // Without an explicit ordering, fields can arrive in any order, which makes
    // cached and logged responses needlessly hard to compare.
    propertyOrdering: ['category', 'confidence'],
  };
}

/** Standard JSON Schema, for any OpenAI-compatible provider. */
export function jsonResponseSchema(categories: readonly string[]): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      category: { type: 'string', enum: [...categories], description: CATEGORY_DESCRIPTION },
      confidence: { type: 'number', description: CONFIDENCE_DESCRIPTION },
    },
    required: ['category', 'confidence'],
    additionalProperties: false,
  };
}
