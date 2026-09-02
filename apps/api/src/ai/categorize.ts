import { FALLBACK_CATEGORY, type CategorizeResult } from '@expense/shared';
import { normalizeDescription } from './normalize.js';
import { RULE_CONFIDENCE, matchRule } from './rules.js';
import type { AskModel, CategorizeInput } from './providers/types.js';

const CACHE_LIMIT = 200;
const FALLBACK_CONFIDENCE = 0;

/**
 * A per-container cache, not a per-user one.
 *
 * Expense descriptions repeat heavily ("Starbucks", "gas", "rent") and the
 * classification depends only on the text and the category list - not on who
 * asked. Keeping it per container is free, dies with the Lambda, and avoids
 * introducing Redis into an MVP. The limit exists only so memory cannot grow
 * unbounded in a long-lived container.
 */
const cache = new Map<string, CategorizeResult>();

const cacheKey = (description: string, categories: readonly string[]): string =>
  `${categories.join('|')}::${normalizeDescription(description)}`;

function remember(key: string, result: CategorizeResult): CategorizeResult {
  if (cache.size >= CACHE_LIMIT) {
    // Drop the oldest entry: Map preserves insertion order.
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(key, result);
  return result;
}

export type CategorizeDeps = {
  askModel: AskModel;
};

/**
 * A three-step cascade: rule -> model -> fallback.
 *
 * The order is the answer to "when is an AI call worth making?". The rule
 * resolves the common case for free and in microseconds; the model is asked only
 * about what is genuinely ambiguous; and the fallback guarantees the feature can
 * NEVER block someone from recording an expense. `source` is returned so the UI
 * can be honest about where a suggestion came from.
 *
 * The model is injected so that testing this logic does not require the network.
 */
export async function categorize(
  input: CategorizeInput,
  allowedCategories: readonly string[],
  deps: CategorizeDeps,
): Promise<CategorizeResult> {
  const key = cacheKey(input.description, allowedCategories);
  const cached = cache.get(key);
  if (cached) return cached;

  const ruled = matchRule(input.description);
  if (ruled && allowedCategories.includes(ruled)) {
    return remember(key, { category: ruled, confidence: RULE_CONFIDENCE, source: 'rule' });
  }

  const fromModel = await deps.askModel(input, allowedCategories);
  // The membership check happens HERE as well, not only inside `askModel`. This
  // function promises its result is always in `allowedCategories`; if that
  // promise leaned on the injected dependency having validated, it would hold
  // only until someone wrote a second `askModel`.
  if (fromModel && allowedCategories.includes(fromModel.category)) {
    return remember(key, { ...fromModel, source: 'model' });
  }

  // A fallback is NOT cached: the next attempt deserves a fresh chance, because
  // the failure was in the transport, not in the description.
  const fallback = allowedCategories.includes(FALLBACK_CATEGORY)
    ? FALLBACK_CATEGORY
    : (allowedCategories[0] ?? FALLBACK_CATEGORY);
  return { category: fallback, confidence: FALLBACK_CONFIDENCE, source: 'fallback' };
}

/** Tests only: the cache is global by design. */
export const clearCategorizeCache = (): void => cache.clear();
