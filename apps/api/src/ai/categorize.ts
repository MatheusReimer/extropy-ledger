import { FALLBACK_CATEGORY, type CategorizeResult } from '@expense/shared';
import type { AskModel, CategorizeInput } from './providers/types.js';

const FALLBACK_CONFIDENCE = 0;

export type CategorizeDeps = {
  askModel: AskModel;
};

export async function categorize(
  input: CategorizeInput,
  allowedCategories: readonly string[],
  deps: CategorizeDeps,
): Promise<CategorizeResult> {
  const fromModel = await deps.askModel(input, allowedCategories);
  if (fromModel && allowedCategories.includes(fromModel.category)) {
    return { ...fromModel, source: 'model' };
  }

  const fallback = allowedCategories.includes(FALLBACK_CATEGORY)
    ? FALLBACK_CATEGORY
    : (allowedCategories[0] ?? FALLBACK_CATEGORY);
  return { category: fallback, confidence: FALLBACK_CONFIDENCE, source: 'fallback' };
}
