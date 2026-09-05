import { Box, HStack, Stack, Text } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import { TrendDownIcon, TrendUpIcon } from './icons';
import { useCountUp } from './motion';

export type Delta = { percent: number; label: string };

export function toDelta(current: number, previous: number, label: string): Delta | undefined {
  if (previous <= 0) return undefined;
  const percent = Math.round(((current - previous) / previous) * 100);
  return percent === 0 ? undefined : { percent, label };
}

type Props = {
  label: string;
  value?: string;
  cents?: number;
  format?: (cents: number) => string;
  hint?: string | undefined;
  delta?: Delta | undefined;
  icon?: ReactNode;
};

export function StatCard({ label, value, cents, format, hint, delta, icon }: Props) {
  const counted = useCountUp(cents ?? 0);
  const shown = cents === undefined ? (value ?? '') : (format?.(counted) ?? String(counted));
  const rising = (delta?.percent ?? 0) > 0;

  return (
    <Box
      borderWidth="1px"
      borderColor="border"
      borderRadius="panel"
      bg="bg.panel"
      px="5"
      py="4"
      minW={{ base: '13.5rem', md: 'auto' }}
      scrollSnapAlign="start"
      flexShrink="0"
      transition="border-color 160ms, transform 160ms"
      _hover={{ borderColor: 'border.emphasized', transform: 'translateY(-2px)' }}
    >
      <Stack gap="2.5">
        <HStack justify="space-between" align="flex-start">
          <Text
            fontSize="xs"
            fontWeight="semibold"
            letterSpacing="0.08em"
            textTransform="uppercase"
            color="fg.subtle"
          >
            {label}
          </Text>
          {icon ? <Box color="fg.subtle">{icon}</Box> : null}
        </HStack>

        <Text
          fontSize={{ base: '2xl', md: '3xl' }}
          fontWeight="semibold"
          letterSpacing="-0.03em"
          lineHeight="1.05"
          truncate
        >
          {shown}
        </Text>

        {delta ? (
          <HStack gap="1.5" color="fg.muted" fontSize="xs">
            <Box color={rising ? 'trend.up' : 'trend.down'}>
              {rising ? <TrendUpIcon size={14} /> : <TrendDownIcon size={14} />}
            </Box>
            <Text>
              {rising ? '+' : ''}
              {delta.percent}% {delta.label}
            </Text>
          </HStack>
        ) : hint ? (
          <Text fontSize="xs" color="fg.muted" truncate>
            {hint}
          </Text>
        ) : (
          <Box height="1rem" />
        )}
      </Stack>
    </Box>
  );
}

export function StatRow({ children }: { children: ReactNode }) {
  return (
    <HStack
      gap="3"
      overflowX={{ base: 'auto', md: 'visible' }}
      scrollSnapType={{ base: 'x mandatory', md: 'none' }}
      align="stretch"
      pb={{ base: '1', md: '0' }}
      mx={{ base: '-4', md: '0' }}
      px={{ base: '4', md: '0' }}
      css={{
        '&::-webkit-scrollbar': { display: 'none' },
        scrollbarWidth: 'none',
        '& > *': { flex: { md: '1' } },
      }}
    >
      {children}
    </HStack>
  );
}
