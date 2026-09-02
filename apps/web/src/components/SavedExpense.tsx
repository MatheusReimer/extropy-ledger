import { Box, Button, HStack, Stack, Text } from '@chakra-ui/react';
import type { CategoryDto, ExpenseDto } from '@expense/shared';
import { useI18n, useT } from '../i18n';
import { CategoryIcon } from './CategoryIcon';

/**
 * What was just saved, shown where the form was.
 *
 * The form used to blank itself on success and say nothing at all - the only
 * evidence anything happened was a new row further down the page, which on a
 * narrow window is below the fold. Blanking a form someone just filled in is
 * also the one outcome indistinguishable from losing their input.
 *
 * So the panel confirms the entry and then gets out of the way on a click.
 * Adding another expense stays one action, and it is a deliberate action rather
 * than an automatic reset, because the confirmation is only useful if it is
 * still there when the user looks up.
 */
export function SavedExpense({
  expense,
  categories,
  onAddAnother,
  landedInMonth,
}: {
  expense: ExpenseDto;
  categories: CategoryDto[];
  onAddAnother: () => void;
  /**
   * Set only when the entry belongs to a month other than the one on screen when
   * it was saved - a receipt dated the 8th of last month, typically.
   */
  landedInMonth?: string | undefined;
}) {
  const t = useT();
  const { formatExpense, localeTag } = useI18n();
  const money = formatExpense(expense.amountCents, expense.currency, expense.baseCents);
  const category = categories.find((entry) => entry.id === expense.categoryId);

  // `YYYY-MM-DD` is parsed as UTC midnight, so it is formatted in UTC too -
  // otherwise a user west of Greenwich sees yesterday's date on their own entry.
  const date = new Date(`${expense.date}T00:00:00Z`).toLocaleDateString(localeTag, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <Stack
      gap="4"
      p="4"
      borderRadius="card"
      borderWidth="1px"
      borderColor="border"
      bg="bg.subtle"
      animationName="rise"
      animationDuration="380ms"
      animationTimingFunction="cubic-bezier(0.16, 1, 0.3, 1)"
      animationFillMode="backwards"
    >
      <Stack gap="1">
        <Text fontSize="xs" fontWeight="semibold" letterSpacing="0.08em" textTransform="uppercase" color="accent">
          {t('saved.title')}
        </Text>
        {/*
          A receipt dated last month creates a LAST MONTH expense, so this
          month's totals correctly do not move. Saying nothing makes that look
          like a broken dashboard - the row is plainly there and every figure
          reads zero. The page follows the money, and this says so out loud
          rather than leaving the reader to work out why the month changed.
        */}
        <Text fontSize="sm" color={landedInMonth ? 'accent' : 'fg.muted'}>
          {landedInMonth ? t('saved.landedIn', { month: landedInMonth }) : t('saved.hint')}
        </Text>
      </Stack>

      <HStack justify="space-between" align="flex-start" gap="4">
        <HStack gap="2.5" minW="0" align="flex-start">
          <Box color="accent" pt="0.5">
            <CategoryIcon name={category?.name ?? ''} size={16} />
          </Box>
          <Stack gap="0.5" minW="0">
            <Text fontSize="sm" fontWeight="medium" truncate>
              {expense.description}
            </Text>
            <Text fontSize="xs" color="fg.muted">
              {category?.name} · {date}
            </Text>
          </Stack>
        </HStack>

        <Stack gap="0" textAlign="end" flexShrink="0">
          <Text fontSize="md" fontWeight="semibold" whiteSpace="nowrap">
            {money.original}
          </Text>
          {/* Only when it says something the line above does not. */}
          {money.converted ? (
            <Text fontSize="xs" color="fg.muted" whiteSpace="nowrap">
              {t('money.approx', { amount: money.converted })}
            </Text>
          ) : null}
        </Stack>
      </HStack>

      <Button size="sm" variant="solid" onClick={onAddAnother} alignSelf="flex-start">
        {t('saved.addAnother')}
      </Button>
    </Stack>
  );
}
