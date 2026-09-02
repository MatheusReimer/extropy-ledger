import { parseAmountToCents, type ExtractedFields } from '@expense/shared';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** Empty string is the schema's "not found", so it collapses to null here. */
const text = (value: unknown, maxLength: number): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed.slice(0, maxLength);
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Turns the model's JSON into a draft, discarding anything it cannot vouch for.
 *
 * The amount goes through the SAME `parseAmountToCents` the manual form uses, so
 * a receipt and a typed entry cannot disagree about what "12.50" means. It also
 * keeps money off the floating-point path: the model returns a string precisely
 * so nothing here has to multiply a float by 100.
 */
export function parseExtractedExpense(
  raw: unknown,
  allowedCategories: readonly string[],
): ExtractedFields | undefined {
  if (!isRecord(raw)) return undefined;

  /**
   * The schema asks for the amount as a STRING, and not every model obliges.
   *
   * Gemini honours it because its schema constrains decoding. An
   * OpenAI-compatible model reading the same schema returned
   * `"amount": 123.76` - a number, and the correct one. Discarding a right
   * answer over its JSON type would be brittleness, not strictness, so a finite
   * number is stringified and sent down the same path.
   *
   * That path still matters: `parseAmountToCents` is the function the manual
   * form uses, so a receipt and a typed entry cannot disagree about what "12.50"
   * means, and money never touches a float multiply here.
   */
  const rawAmount = raw['amount'];
  const amountText =
    typeof rawAmount === 'number' && Number.isFinite(rawAmount)
      ? String(rawAmount)
      : text(rawAmount, 32);
  const amountCents = amountText === null ? null : parseAmountToCents(amountText);

  const dateText = text(raw['date'], 10);
  // A date the model invented in the wrong shape is worse than no date: it would
  // silently fail the create-expense schema later, at a point with no context.
  const date = dateText && DATE_PATTERN.test(dateText) ? dateText : null;

  const categoryText = text(raw['category'], 64);
  const category =
    allowedCategories.find((allowed) => allowed.toLowerCase() === categoryText?.toLowerCase()) ??
    null;

  const rawConfidence = raw['confidence'];
  const confidence =
    typeof rawConfidence === 'number' && Number.isFinite(rawConfidence)
      ? Math.min(1, Math.max(0, rawConfidence))
      : 0;

  const extracted: ExtractedFields = {
    merchant: text(raw['merchant'], 120),
    description: text(raw['description'], 200),
    amountCents,
    currency: text(raw['currency'], 8)?.toUpperCase() ?? null,
    date,
    category,
    confidence,
  };

  // A draft with no amount and no merchant is not worth showing anyone - that is
  // a photograph of something that was not a receipt.
  if (extracted.amountCents === null && extracted.merchant === null) return undefined;
  return extracted;
}
