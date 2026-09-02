import { Box, HStack, Stack, Text } from '@chakra-ui/react';
import { useI18n, useT } from '../i18n';
import type { CategoryBreakdown } from '@expense/shared';
import { CategoryIcon } from './CategoryIcon';
import { BudgetRow } from './BudgetRow';

/**
 * A category as a card with a share bar.
 *
 * The chart answers "which is biggest" at a glance; this answers "how much, and
 * what fraction of the month" without making anyone read an axis. The bar is
 * scaled against the LARGEST category rather than the total, because against the
 * total every bar in a well-spread month is a stub and the comparison dies.
 */
export function CategoryCard({
  breakdown,
  largestCents,
  totalCents,
  limitCents,
  onSetBudget,
  savingBudget,
}: {
  breakdown: CategoryBreakdown;
  largestCents: number;
  totalCents: number;
  limitCents: number | undefined;
  onSetBudget: (limitCents: number | null) => void;
  savingBudget: boolean;
}) {
  const t = useT();
  const { formatBase } = useI18n();
  const relative = largestCents > 0 ? (breakdown.totalCents / largestCents) * 100 : 0;
  const share = totalCents > 0 ? Math.round((breakdown.totalCents / totalCents) * 100) : 0;

  return (
    <Box
      borderWidth="1px"
      borderColor="border"
      borderRadius="card"
      bg="bg.panel"
      px="4"
      py="3.5"
      _hover={{ borderColor: 'border.emphasized', transform: 'translateY(-2px)' }}
      transition="border-color 160ms, transform 160ms"
    >
      <Stack gap="3">
        <HStack justify="space-between" align="center" gap="3">
          <HStack gap="2.5" minW="0">
            <Box color="accent">
              <CategoryIcon name={breakdown.name} size={17} />
            </Box>
            <Text fontSize="sm" fontWeight="medium" truncate>
              {breakdown.name}
            </Text>
          </HStack>
          <Text fontSize="sm" fontWeight="semibold" whiteSpace="nowrap">
            {formatBase(breakdown.totalCents)}
          </Text>
        </HStack>

        <Box
          height="6px"
          borderRadius="full"
          bg="bg.muted"
          overflow="hidden"
          role="img"
          aria-label={`${share}% of this month's spending`}
        >
          <Box
            height="100%"
            width={`${Math.max(relative, 3)}%`}
            borderRadius="full"
            bg="accent.data"
            transformOrigin="left"
            animationName="grow"
            animationDuration="620ms"
            animationTimingFunction="cubic-bezier(0.16, 1, 0.3, 1)"
            animationFillMode="backwards"
          />
        </Box>

        <HStack justify="space-between" fontSize="xs" color="fg.muted">
          <Text>
            {breakdown.count}{' '}
            {breakdown.count === 1 ? t('categories.expense') : t('categories.expenses')}
          </Text>
          <Text>{t('categories.ofMonth', { percent: share })}</Text>
        </HStack>

        <BudgetRow
          spentCents={breakdown.totalCents}
          limitCents={limitCents}
          onSave={onSetBudget}
          saving={savingBudget}
        />
      </Stack>
    </Box>
  );
}
