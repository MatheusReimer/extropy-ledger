export type ModelCategory = { category: string; confidence: number };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * Revalidation of the model's output - every "don't trust it" rule lives here.
 *
 * The response schema should already guarantee the shape. "Should" is not a
 * strong enough guarantee for a path that ends in a database write: the schema
 * can be edited, the model swapped, the SDK upgraded, or a response truncated
 * mid-object by an output-token limit. Returning `undefined` routes the flow to
 * the fallback instead of persisting a category that does not exist.
 */
export function parseModelCategory(
  raw: unknown,
  allowedCategories: readonly string[],
): ModelCategory | undefined {
  if (!isRecord(raw)) return undefined;

  const { category, confidence } = raw;
  if (typeof category !== 'string') return undefined;

  // Match case-insensitively, but ALWAYS return the canonical spelling - that is
  // what gets resolved into a categoryId.
  const canonical = allowedCategories.find(
    (allowed) => allowed.toLowerCase() === category.trim().toLowerCase(),
  );
  if (!canonical) return undefined;

  const numeric = typeof confidence === 'number' && Number.isFinite(confidence) ? confidence : 0.5;
  return { category: canonical, confidence: Math.min(1, Math.max(0, numeric)) };
}

/**
 * The text-to-result boundary.
 *
 * Constrained decoding makes malformed JSON unlikely, not impossible - a
 * response cut off at the token limit is still valid UTF-8 and invalid JSON. A
 * throw here would surface as a 500 on a route whose entire promise is that it
 * degrades gracefully, so the parse failure becomes `undefined` instead.
 */
export function parseModelResponse(
  text: string | undefined,
  allowedCategories: readonly string[],
): ModelCategory | undefined {
  if (!text) return undefined;

  try {
    return parseModelCategory(JSON.parse(text), allowedCategories);
  } catch {
    return undefined;
  }
}
