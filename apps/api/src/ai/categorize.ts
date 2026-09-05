import { FALLBACK_CATEGORY, type CategorizeResult } from '@expense/shared';
import { RULE_CONFIDENCE, matchRule } from './rules.js';
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
  const ruled = matchRule(input.description);
  if (ruled && allowedCategories.includes(ruled)) {
    return { category: ruled, confidence: RULE_CONFIDENCE, source: 'rule' };
  }

  const fromModel = await deps.askModel(input, allowedCategories);
  if (fromModel && allowedCategories.includes(fromModel.category)) {
    return { ...fromModel, source: 'model' };
  }

  const fallback = allowedCategories.includes(FALLBACK_CATEGORY)
    ? FALLBACK_CATEGORY
    : (allowedCategories[0] ?? FALLBACK_CATEGORY);
  return { category: fallback, confidence: FALLBACK_CONFIDENCE, source: 'fallback' };
}
