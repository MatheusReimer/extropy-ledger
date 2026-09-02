import { StrictMode, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { system } from './theme';
import { ApiError } from './api/client';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { I18nProvider } from './i18n';
import { LocalePreferenceProvider, useLocalePreference } from './i18n/preference';
import { useRate } from './api/hooks';

/**
 * A 401 on any request ends the session - once, here.
 *
 * The alternative is every hook remembering to check for 401, and the day one
 * forgets, the user is stuck on a screen that only shows an error and never
 * offers a login. Since the token expires on its own (JWT_TTL), this path is
 * routine rather than exceptional.
 */
function QueryProvider({ children }: { children: ReactNode }) {
  const { signOut } = useAuth();

  const [client] = useState(() => {
    const onError = (error: unknown) => {
      if (error instanceof ApiError && error.status === 401) signOut();
    };

    return new QueryClient({
      queryCache: new QueryCache({ onError }),
      mutationCache: new MutationCache({ onError }),
      defaultOptions: {
        queries: {
          // A 4xx is about the request, not the network: retrying returns the
          // same answer three times more slowly. Only 5xx and connection
          // failures deserve a retry.
          retry: (failureCount, error) => {
            if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
            return failureCount < 2;
          },
          staleTime: 30_000,
          refetchOnWindowFocus: false,
        },
      },
    });
  });

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/**
 * Language and currency come from the signed-in user, so this sits INSIDE the
 * query provider - it needs a session to read preferences from and a query
 * client to fetch the rate with. Signed out, it falls back to English and USD,
 * which is exactly what the auth screen needs.
 */
function Localized() {
  const { session } = useAuth();
  // Signed out there is no user to ask, so the visitor's own choice stands in -
  // otherwise the sign-in screen is permanently English.
  const { locale: preferred } = useLocalePreference();
  const displayCurrency = session?.user.displayCurrency ?? 'USD';
  const rate = useRate(displayCurrency);

  return (
    <I18nProvider
      locale={session?.user.locale ?? preferred}
      displayCurrency={displayCurrency}
      rate={rate.data?.rate ?? null}
    >
      <App />
    </I18nProvider>
  );
}

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found in index.html');

createRoot(container).render(
  <StrictMode>
    <ChakraProvider value={system}>
      <AuthProvider>
        <QueryProvider>
          <LocalePreferenceProvider>
            <Localized />
          </LocalePreferenceProvider>
        </QueryProvider>
      </AuthProvider>
    </ChakraProvider>
  </StrictMode>,
);
