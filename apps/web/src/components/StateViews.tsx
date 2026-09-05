import { Alert, Box, Center, HStack, Spinner, Stack, Text } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import { ApiError } from '../api/client';
import { InfoIcon } from './icons';
import { useT } from '../i18n';

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

type Translate = ReturnType<typeof useT>;

function describe(error: unknown, t: Translate): { title: string; hint: string } {
  if (error instanceof ApiError) {
    if (error.status === 0) {
      return { title: t('error.unreachable'), hint: t('error.unreachableHint') };
    }
    if (error.status === 401) {
      return { title: t('error.expired'), hint: t('error.expiredHint') };
    }
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

export function Notice({ children }: { children: ReactNode }) {
  return (
    <HStack
      gap="2.5"
      align="flex-start"
      borderWidth="1px"
      borderColor="border"
      borderRadius="card"
      bg="bg.subtle"
      px="4"
      py="3"
      role="status"
    >
      <Box color="fg.subtle" mt="0.5">
        <InfoIcon size={15} />
      </Box>
      <Text fontSize="sm" color="fg.muted">
        {children}
      </Text>
    </HStack>
  );
}
