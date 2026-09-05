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
          retry: (failureCount, error) => {
            if (error instanceof ApiError && error.status >= 400 && error.status < 500)
              return false;
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

function Localized() {
  const { session } = useAuth();
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
