/**
 * The currencies the app knows about.
 *
 * Deliberately a short list rather than all of ISO 4217: every entry has to be
 * covered by the rate source, and offering a currency that silently fails to
 * convert is worse than not offering it. These are all published by the ECB via
 * Frankfurter.
 */
export const CURRENCIES = [
  'USD',
  'EUR',
  'BRL',
  'GBP',
  'JPY',
  'CAD',
  'AUD',
  'CHF',
  'MXN',
  'SEK',
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number];

/**
 * Everything is measured against USD internally.
 *
 * Reports need a single unit to add up in, and picking one at write time is what
 * keeps the aggregation a plain `$sum` in the database rather than a per-row
 * conversion in Node.
 */
export const BASE_CURRENCY: CurrencyCode = 'USD';

export const isCurrency = (value: string): value is CurrencyCode =>
  (CURRENCIES as readonly string[]).includes(value);

/** Shown next to the code in pickers, so the choice does not require memorising ISO. */
export const CURRENCY_LABELS: Record<CurrencyCode, string> = {
  USD: 'US Dollar',
  EUR: 'Euro',
  BRL: 'Brazilian Real',
  GBP: 'British Pound',
  JPY: 'Japanese Yen',
  CAD: 'Canadian Dollar',
  AUD: 'Australian Dollar',
  CHF: 'Swiss Franc',
  MXN: 'Mexican Peso',
  SEK: 'Swedish Krona',
};

/**
 * Applies a rate to an integer minor-unit amount.
 *
 * Rounds once, at the end, and only ever from the original - never from an
 * already-converted value. Chaining conversions compounds the rounding error,
 * and on money that error is visible.
 */
export function convertCents(cents: number, rate: number): number {
  return Math.round(cents * rate);
}

/**
 * Formats in the given currency and locale.
 *
 * `Intl` knows that JPY has no minor units and that pt-BR writes `R$ 1.234,56`,
 * so none of that is hardcoded here. Passing the currency explicitly - rather
 * than defaulting to USD as this used to - is what stops a Brazilian receipt
 * being displayed with a dollar sign.
 */
export function formatMoney(cents: number, currency: string, locale = 'en-US'): string {
  const formatter = new Intl.NumberFormat(locale, { style: 'currency', currency });
  // `resolvedOptions` reports the real minor-unit count: JPY is 0, most are 2.
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  return formatter.format(cents / 10 ** digits);
}

/**
 * The languages the interface is translated into.
 *
 * Kept beside the currencies because they travel together: a locale drives both
 * the wording and how `Intl` writes a number, so pt-BR gets "R$ 1.234,56" for
 * free rather than through a special case.
 */
export const LOCALES = ['en', 'pt', 'es'] as const;
export type Locale = (typeof LOCALES)[number];

/** BCP 47 tags for `Intl`, which needs a region to format money correctly. */
export const LOCALE_TAGS: Record<Locale, string> = {
  en: 'en-US',
  pt: 'pt-BR',
  es: 'es-ES',
};

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  pt: 'Portugues',
  es: 'Espanol',
};

export const isLocale = (value: string): value is Locale =>
  (LOCALES as readonly string[]).includes(value);
