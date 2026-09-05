import { Type, type Schema } from '@google/genai';

const CATEGORY_DESCRIPTION = 'The single best category for this expense.';
const CONFIDENCE_DESCRIPTION =
  'How confident you are, from 0 to 1. Use a low value when the description is vague.';

export function geminiResponseSchema(categories: readonly string[]): Schema {
  return {
    type: Type.OBJECT,
    properties: {
      category: { type: Type.STRING, enum: [...categories], description: CATEGORY_DESCRIPTION },
      confidence: { type: Type.NUMBER, description: CONFIDENCE_DESCRIPTION },
    },
    required: ['category', 'confidence'],
    propertyOrdering: ['category', 'confidence'],
  };
}

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
