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

export const BASE_CURRENCY: CurrencyCode = 'USD';

export const isCurrency = (value: string): value is CurrencyCode =>
  (CURRENCIES as readonly string[]).includes(value);

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

const digitsByCurrency = new Map<string, number>();

/**
 * How many decimal places the currency has. Two for most, zero for JPY.
 * Read from `Intl` rather than a table of our own, so the answer matches the
 * one the formatter will use.
 */
export function minorUnitDigits(currency: string): number {
  const cached = digitsByCurrency.get(currency);
  if (cached !== undefined) return cached;

  const digits =
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  digitsByCurrency.set(currency, digits);
  return digits;
}

export const minorUnitScale = (currency: string): number => 10 ** minorUnitDigits(currency);

/**
 * Convert minor units of one currency into minor units of another.
 *
 * `rate` is quoted in whole currency UNITS, which is why the two scales have to
 * appear: 15000 minor units of JPY is 15000 yen, and at 0.0063 that is 94.5
 * dollars, which is 9450 minor units of USD - not 94.
 */
export function convertMinorUnits(amount: number, rate: number, from: string, to: string): number {
  return Math.round((amount * rate * minorUnitScale(to)) / minorUnitScale(from));
}

export function formatMoney(amount: number, currency: string, locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(
    amount / minorUnitScale(currency),
  );
}

export const LOCALES = ['en', 'pt', 'es'] as const;
export type Locale = (typeof LOCALES)[number];

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
