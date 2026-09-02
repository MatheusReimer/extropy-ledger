/**
 * Money is stored and transported as an INTEGER NUMBER OF CENTS.
 *
 * Binary floats cannot represent 0.1 exactly, so adding up expenses as decimal
 * `number`s accumulates error — unacceptable in a spending report. Conversion to
 * decimal happens only at the edges: form input and on-screen formatting.
 */
export const CENTS_PER_UNIT = 100;

/** "12.34" | 12.34 -> 1234. Returns null when the input is not a valid amount. */
export function parseAmountToCents(input: string | number): number | null {
  const raw = typeof input === 'number' ? input.toString() : input.trim().replace(',', '.');
  if (!/^\d{1,13}(\.\d{1,2})?$/.test(raw)) return null;

  const [whole = '0', frac = ''] = raw.split('.');
  const cents = Number(whole) * CENTS_PER_UNIT + Number(frac.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** 1234 -> "12.34" (no currency symbol). */
export function centsToDecimalString(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.trunc(abs / CENTS_PER_UNIT)}.${String(abs % CENTS_PER_UNIT).padStart(2, '0')}`;
}

/** 1234 -> "$12.34". Currency is fixed in the MVP; see "what I'd do next" in the README. */
export function formatCents(cents: number, locale = 'en-US', currency = 'USD'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(
    cents / CENTS_PER_UNIT,
  );
}
