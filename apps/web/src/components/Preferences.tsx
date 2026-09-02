import { Box, NativeSelect, Stack, Text } from '@chakra-ui/react';
import {
  CURRENCIES,
  CURRENCY_LABELS,
  LOCALES,
  LOCALE_LABELS,
  type CurrencyCode,
  type Locale,
} from '@expense/shared';
import { useUpdatePreferences } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { useT } from '../i18n';

/**
 * Language and display currency, in the sidebar.
 *
 * Two selects rather than a settings page, because there are exactly two
 * settings and a whole route to hold them would be more navigation than
 * content. They sit in the rail so the effect - the entire interface changing
 * language, every figure changing currency - is visible the instant it happens.
 */
export function Preferences() {
  const { session, updateUser } = useAuth();
  const update = useUpdatePreferences();
  const t = useT();

  const apply = (patch: { displayCurrency?: CurrencyCode; locale?: Locale }) => {
    // Applied locally the moment the server accepts it. Refetching the session
    // would be a second source of truth for something we already know.
    update.mutate(patch, { onSuccess: (user) => updateUser(user) });
  };

  return (
    <Stack gap="3">
      <Text
        fontSize="xs"
        fontWeight="semibold"
        letterSpacing="0.08em"
        textTransform="uppercase"
        color="fg.muted"
        px="1"
      >
        {t('settings.title')}
      </Text>

      <Stack gap="2">
        <NativeSelect.Root size="xs" disabled={update.isPending}>
          <NativeSelect.Field
            aria-label={t('settings.language')}
            borderRadius="control"
            bg="bg.panel"
            value={session?.user.locale ?? 'en'}
            onChange={(event) => apply({ locale: event.target.value as Locale })}
          >
            {LOCALES.map((locale) => (
              <option key={locale} value={locale}>
                {LOCALE_LABELS[locale]}
              </option>
            ))}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>

        <NativeSelect.Root size="xs" disabled={update.isPending}>
          <NativeSelect.Field
            aria-label={t('settings.currency')}
            borderRadius="control"
            bg="bg.panel"
            value={session?.user.displayCurrency ?? 'USD'}
            onChange={(event) => apply({ displayCurrency: event.target.value as CurrencyCode })}
          >
            {CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {currency} · {CURRENCY_LABELS[currency]}
              </option>
            ))}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
      </Stack>

      {/*
        Says out loud what the setting does NOT do. Someone changing display
        currency on a ledger has every reason to wonder whether their records
        just got rewritten.
      */}
      <Box px="1">
        {/* fg.subtle is 2.73:1 even on the frosted surface; fg.muted is 4.80:1. */}
        <Text fontSize="2xs" color="fg.muted" lineHeight="1.4">
          {t('settings.currencyNote')}
        </Text>
      </Box>
    </Stack>
  );
}
