import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import {
  BASE_CURRENCY,
  LOCALE_TAGS,
  convertCents,
  formatMoney,
  isLocale,
  type CurrencyCode,
  type Locale,
} from '@expense/shared';
import { en, type Dictionary, type TranslationKey } from './en';
import { pt } from './pt';
import { es } from './es';

const DICTIONARIES: Record<Locale, Dictionary> = { en, pt, es };

/**
 * `{name}` substitution, and nothing more.
 *
 * No plural engine, no date grammar, no nesting. Each of those is a real
 * problem that a real i18n library solves properly, and none of them appears in
 * this interface - the two places that need a plural pick between two explicit
 * keys, which is honest and readable. Building a half-implementation of ICU
 * message syntax would be worse than either extreme.
 */
function interpolate(template: string, values?: Record<string, string | number>): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? String(values[key]) : whole,
  );
}

export type Money = {
  /** The exact amount as spent, in its own currency. Never converted. */
  original: string;
  /**
   * The same value in the display currency, or undefined when it needs no
   * conversion (already that currency) or cannot have one (no rate).
   */
  converted?: string | undefined;
};

type I18nValue = {
  locale: Locale;
  localeTag: string;
  displayCurrency: CurrencyCode;
  /** Base -> display. Null when the rate service could not be reached. */
  rate: number | null;
  t: (key: TranslationKey, values?: Record<string, string | number>) => string;
  /** Formats a base-currency figure - totals, averages, chart values. */
  formatBase: (baseCents: number) => string;
  /** Formats one expense: what was spent, plus its display-currency equivalent. */
  formatExpense: (amountCents: number, currency: string, baseCents: number | null) => Money;
  /**
   * The round trip for a figure the user both READS and TYPES - a budget.
   *
   * Every other amount travels one way: stored as spent, shown converted. A
   * budget is entered in whatever currency the user is reading, so it has to
   * convert back before it is stored. Both directions live here so the
   * "no rate available" case is handled once rather than at each call site.
   */
  toDisplayAmount: (baseCents: number) => string;
  toBaseCents: (displayCents: number) => number;
};

const I18nContext = createContext<I18nValue | undefined>(undefined);

export function I18nProvider({
  locale,
  displayCurrency,
  rate,
  children,
}: {
  locale: string;
  displayCurrency: string;
  rate: number | null;
  children: ReactNode;
}) {
  const value = useMemo<I18nValue>(() => {
    const resolved: Locale = isLocale(locale) ? locale : 'en';
    const tag = LOCALE_TAGS[resolved];
    const dictionary = DICTIONARIES[resolved];
    const display = displayCurrency as CurrencyCode;

    const t = (key: TranslationKey, values?: Record<string, string | number>) =>
      interpolate(dictionary[key], values);

    /**
     * Every aggregate in a view is converted with the SAME rate.
     *
     * Converting each figure independently would let rounding drift until the
     * rows on screen no longer added up to the total beside them - the sort of
     * discrepancy that makes people stop trusting a money app entirely.
     */
    const formatBase = (baseCents: number) =>
      display === BASE_CURRENCY || rate === null
        ? formatMoney(baseCents, BASE_CURRENCY, tag)
        : formatMoney(convertCents(baseCents, rate), display, tag);

    /**
     * A row shows what was actually spent, in the currency it was spent in.
     *
     * Showing a converted figure as the primary value would quietly rewrite
     * history - R$500 becomes "$96.18" and the original is gone. The equivalent
     * is offered alongside it, marked approximate, and only when it says
     * something the primary does not.
     */
    const formatExpense = (amountCents: number, currency: string, baseCents: number | null) => {
      const original = formatMoney(amountCents, currency, tag);
      if (currency === display) return { original };
      if (baseCents === null) return { original };
      return { original, converted: formatBase(baseCents) };
    };

    const converts = display !== BASE_CURRENCY && rate !== null && rate > 0;

    // A plain decimal string for an input box - no symbol, no grouping, since
    // this is a value to be edited rather than read.
    const toDisplayAmount = (baseCents: number) =>
      ((converts ? convertCents(baseCents, rate) : baseCents) / 100).toFixed(2);

    const toBaseCents = (displayCents: number) =>
      converts ? convertCents(displayCents, 1 / rate) : displayCents;

    return {
      locale: resolved,
      localeTag: tag,
      displayCurrency: display,
      rate,
      t,
      formatBase,
      formatExpense,
      toDisplayAmount,
      toBaseCents,
    };
  }, [locale, displayCurrency, rate]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside <I18nProvider>');
  return context;
}

/** The common case, so components read `t('nav.overview')` rather than `i18n.t(...)`. */
export function useT() {
  const { t } = useI18n();
  return useCallback(t, [t]);
}

export type { TranslationKey };
