import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { isLocale, type Locale } from '@expense/shared';

/**
 * The language a visitor picked before they had an account.
 *
 * Signed in, the locale is the user's stored preference and the server is the
 * source of truth. Signed OUT there is no user to ask, so the sign-in screen was
 * permanently English with no way to change it - the one screen where a
 * non-English speaker most needs the language they read.
 *
 * Kept in `localStorage` rather than a cookie or the URL: it is a per-device
 * convenience with no security weight, and it should survive a refresh without
 * involving the server.
 */
const STORAGE_KEY = 'expense-tracker/locale';

function readStored(): Locale | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw && isLocale(raw) ? raw : undefined;
  } catch {
    // A private window with storage blocked. Not a reason to fail to render.
    return undefined;
  }
}

/**
 * The browser's own preference, used the very first time someone arrives.
 *
 * `navigator.languages` is ordered by preference, so the first entry we actually
 * support wins - a browser set to `pt-BR, en` gets Portuguese rather than the
 * English further down the list.
 */
function fromBrowser(): Locale | undefined {
  const candidates = typeof navigator === 'undefined' ? [] : (navigator.languages ?? []);
  for (const tag of candidates) {
    const base = tag.split('-')[0]?.toLowerCase();
    if (base && isLocale(base)) return base;
  }
  return undefined;
}

type PreferenceValue = {
  /** What to show when nobody is signed in. */
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
    } catch {
      // Storage unavailable: the choice still applies for this visit.
    }
  }, []);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
  return <PreferenceContext.Provider value={value}>{children}</PreferenceContext.Provider>;
}

export function useLocalePreference(): PreferenceValue {
  const context = useContext(PreferenceContext);
  if (!context) throw new Error('useLocalePreference must be used inside <LocalePreferenceProvider>');
  return context;
}
