import { isCurrency, parseAmountToMinorUnits, type ExtractedFields } from '@expense/shared';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const text = (value: unknown, maxLength: number): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed.slice(0, maxLength);
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function parseExtractedExpense(
  raw: unknown,
  allowedCategories: readonly string[],
): ExtractedFields | undefined {
  if (!isRecord(raw)) return undefined;

  const currency = text(raw['currency'], 8)?.toUpperCase() ?? null;

  const rawAmount = raw['amount'];
  const amountText =
    typeof rawAmount === 'number' && Number.isFinite(rawAmount)
      ? String(rawAmount)
      : text(rawAmount, 32);
  const amountCents =
    amountText === null
      ? null
      : parseAmountToMinorUnits(
          amountText,
          currency && isCurrency(currency) ? currency : undefined,
        );

  const dateText = text(raw['date'], 10);
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
    currency,
    date,
    category,
    confidence,
  };

  if (extracted.amountCents === null && extracted.merchant === null) return undefined;
  return extracted;
}
