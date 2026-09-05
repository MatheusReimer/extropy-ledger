import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { isLocale, type Locale } from '@expense/shared';

const STORAGE_KEY = 'expense-tracker/locale';

function readStored(): Locale | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw && isLocale(raw) ? raw : undefined;
  } catch {
    return undefined;
  }
}

function fromBrowser(): Locale | undefined {
  const candidates = typeof navigator === 'undefined' ? [] : (navigator.languages ?? []);
  for (const tag of candidates) {
    const base = tag.split('-')[0]?.toLowerCase();
    if (base && isLocale(base)) return base;
  }
  return undefined;
}

type PreferenceValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
};

const PreferenceContext = createContext<PreferenceValue | undefined>(undefined);

export function LocalePreferenceProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => readStored() ?? fromBrowser() ?? 'en');

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  }, []);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
  return <PreferenceContext.Provider value={value}>{children}</PreferenceContext.Provider>;
}

export function useLocalePreference(): PreferenceValue {
  const context = useContext(PreferenceContext);
  if (!context)
    throw new Error('useLocalePreference must be used inside <LocalePreferenceProvider>');
  return context;
}
