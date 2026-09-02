import { Alert, Box, Center, Spinner, Stack, Text } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import { ApiError } from '../api/client';
import { useT } from '../i18n';

/**
 * The three states of any read, in one place.
 *
 * "Loading and error states throughout" only actually happens if reaching for
 * the ready-made component is easier than hand-writing `{isLoading && ...}` -
 * otherwise the third screen always forgets the error case.
 */
export function LoadingState({ label }: { label?: string }) {
  const t = useT();
  return (
    <Center py="10" flexDirection="column" gap="3">
      <Spinner size="lg" color="blue.500" />
      <Text fontSize="sm" color="fg.muted">
        {label ?? t('state.loading')}
      </Text>
    </Center>
  );
}

/** Translates the error into something actionable - "try again" alone helps nobody. */
type Translate = ReturnType<typeof useT>;

function describe(error: unknown, t: Translate): { title: string; hint: string } {
  if (error instanceof ApiError) {
    if (error.status === 0) {
      return { title: t('error.unreachable'), hint: t('error.unreachableHint') };
    }
    if (error.status === 401) {
      return { title: t('error.expired'), hint: t('error.expiredHint') };
    }
    // The server's message is already user-facing and already specific; a
    // translated generic would be less useful than the untranslated truth.
    return { title: error.message, hint: t('error.retryHint') };
  }
  return { title: t('error.generic'), hint: t('error.genericHint') };
}

export function ErrorState({ error, children }: { error: unknown; children?: ReactNode }) {
  const t = useT();
  const { title, hint } = describe(error, t);
  return (
    <Alert.Root status="error" borderRadius="md">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>{title}</Alert.Title>
        <Alert.Description>{hint}</Alert.Description>
        {children ? <Box mt="2">{children}</Box> : null}
      </Alert.Content>
    </Alert.Root>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <Stack align="center" py="10" gap="1" textAlign="center">
      <Text fontWeight="medium" color="fg.muted">
        {title}
      </Text>
      {hint ? (
        <Text fontSize="sm" color="fg.subtle">
          {hint}
        </Text>
      ) : null}
    </Stack>
  );
}
