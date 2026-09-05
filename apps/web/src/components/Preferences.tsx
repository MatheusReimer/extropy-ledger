import { Box, HStack, NativeSelect, Stack, Text } from '@chakra-ui/react';
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

export function Preferences({ inline = false }: { inline?: boolean }) {
  const { session, updateUser } = useAuth();
  const update = useUpdatePreferences();
  const t = useT();

  const apply = (patch: { displayCurrency?: CurrencyCode; locale?: Locale }) => {
    update.mutate(patch, { onSuccess: (user) => updateUser(user) });
  };

  const language = (
    <NativeSelect.Root size="xs" disabled={update.isPending} width={inline ? '6.5rem' : 'full'}>
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
  );

  const currency = (
    <NativeSelect.Root size="xs" disabled={update.isPending} width={inline ? '5.5rem' : 'full'}>
      <NativeSelect.Field
        aria-label={t('settings.currency')}
        borderRadius="control"
        bg="bg.panel"
        value={session?.user.displayCurrency ?? 'USD'}
        onChange={(event) => apply({ displayCurrency: event.target.value as CurrencyCode })}
      >
        {CURRENCIES.map((code) => (
          <option key={code} value={code}>
            {inline ? code : `${code} · ${CURRENCY_LABELS[code]}`}
          </option>
        ))}
      </NativeSelect.Field>
      <NativeSelect.Indicator />
    </NativeSelect.Root>
  );

  if (inline) {
    return (
      <HStack gap="2" flexShrink="0">
        {language}
        {currency}
      </HStack>
    );
  }

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
        {language}
        {currency}
      </Stack>

      <Box px="1">
        <Text fontSize="2xs" color="fg.muted" lineHeight="1.4">
          {t('settings.currencyNote')}
        </Text>
      </Box>
    </Stack>
  );
}
