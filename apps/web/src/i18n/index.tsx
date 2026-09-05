import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  BASE_CURRENCY,
  LOCALE_TAGS,
  convertMinorUnits,
  formatMoney,
  isLocale,
  minorUnitsToDecimalString,
  type CurrencyCode,
  type Locale,
} from '@expense/shared';
import { en, type Dictionary, type TranslationKey } from './en';
import { pt } from './pt';
import { es } from './es';

const DICTIONARIES: Record<Locale, Dictionary> = { en, pt, es };

function interpolate(template: string, values?: Record<string, string | number>): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? String(values[key]) : whole,
  );
}

export type Money = {
  original: string;
  converted?: string | undefined;
};

type I18nValue = {
  locale: Locale;
  localeTag: string;
  displayCurrency: CurrencyCode;
  rate: number | null;
  t: (key: TranslationKey, values?: Record<string, string | number>) => string;
  formatBase: (baseCents: number) => string;
  formatExpense: (amountCents: number, currency: string, baseCents: number | null) => Money;
  toDisplayAmount: (baseCents: number) => string;
  toBaseCents: (displayAmount: number) => number;
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

    const formatBase = (baseCents: number) =>
      display === BASE_CURRENCY || rate === null
        ? formatMoney(baseCents, BASE_CURRENCY, tag)
        : formatMoney(convertMinorUnits(baseCents, rate, BASE_CURRENCY, display), display, tag);

    const formatExpense = (amountCents: number, currency: string, baseCents: number | null) => {
      const original = formatMoney(amountCents, currency, tag);
      if (currency === display) return { original };
      if (baseCents === null) return { original };
      return { original, converted: formatBase(baseCents) };
    };

    const converts = display !== BASE_CURRENCY && rate !== null && rate > 0;

    const toDisplayAmount = (baseCents: number) =>
      converts
        ? minorUnitsToDecimalString(
            convertMinorUnits(baseCents, rate, BASE_CURRENCY, display),
            display,
          )
        : minorUnitsToDecimalString(baseCents, BASE_CURRENCY);

    const toBaseCents = (displayAmount: number) =>
      converts ? convertMinorUnits(displayAmount, 1 / rate, display, BASE_CURRENCY) : displayAmount;

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

export function useT() {
  return useI18n().t;
}

export type { TranslationKey };
