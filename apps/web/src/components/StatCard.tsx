import { Box, HStack, Stack, Text } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import { TrendDownIcon, TrendUpIcon } from './icons';
import { useCountUp } from './motion';

export type Delta = { percent: number; label: string };

/**
 * Computes a month-over-month change, and refuses to when it would mislead.
 *
 * A jump from zero is not "+100%", it is a first month - there is no baseline to
 * be a percentage of. Returning `undefined` makes the card omit the row entirely
 * rather than print a number that reads as insight and is not.
 */
export function toDelta(current: number, previous: number, label: string): Delta | undefined {
  if (previous <= 0) return undefined;
  const percent = Math.round(((current - previous) / previous) * 100);
  return percent === 0 ? undefined : { percent, label };
}

type Props = {
  label: string;
  /** Pre-formatted, for anything that is not a plain number. */
  value?: string;
  /**
   * A raw amount in cents, counted up on mount.
   *
   * Passed separately from `value` because a count-up has to animate the NUMBER
   * and format each frame - interpolating a formatted string would produce
   * "$2,1.4" halfway through.
   */
  cents?: number;
  format?: (cents: number) => string;
  hint?: string | undefined;
  delta?: Delta | undefined;
  /**
   * Spending more is not automatically bad and spending less is not automatically
   * good, so the arrow is never coloured green or red. It states the direction
   * and leaves the judgement to the person whose money it is.
   */
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
      // Each card is a snap point, so the mobile row lands cleanly on one card
      // rather than stopping halfway between two.
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
            {/* Brick for rising, olive for falling - never the accent, which
                would make "primary action" and "you overspent" the same idea. */}
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
          // Holds the row height steady so cards without a delta do not sit short.
          <Box height="1rem" />
        )}
      </Stack>
    </Box>
  );
}

/**
 * Side by side on desktop, a swipeable row on mobile.
 *
 * Deliberately not a carousel: no dots, no arrows, no auto-advance. Those hide
 * content behind interaction and are poor for keyboard and screen-reader users.
 * A scroll-snap row gives the same gesture while every card stays present in the
 * DOM, reachable by Tab, and visible to find-in-page.
 */
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
