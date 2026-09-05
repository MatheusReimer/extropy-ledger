export type ModelCategory = { category: string; confidence: number };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export function parseModelCategory(
  raw: unknown,
  allowedCategories: readonly string[],
): ModelCategory | undefined {
  if (!isRecord(raw)) return undefined;

  const { category, confidence } = raw;
  if (typeof category !== 'string') return undefined;

  const canonical = allowedCategories.find(
    (allowed) => allowed.toLowerCase() === category.trim().toLowerCase(),
  );
  if (!canonical) return undefined;

  const numeric = typeof confidence === 'number' && Number.isFinite(confidence) ? confidence : 0.5;
  return { category: canonical, confidence: Math.min(1, Math.max(0, numeric)) };
}

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
