import { Box, Button, HStack, Stack, Text } from '@chakra-ui/react';
import type { CategoryDto, ExpenseDto } from '@expense/shared';
import { useI18n, useT } from '../i18n';
import { CategoryIcon } from './CategoryIcon';

export function SavedExpense({
  expense,
  categories,
  onAddAnother,
  landedInMonth,
}: {
  expense: ExpenseDto;
  categories: CategoryDto[];
  onAddAnother: () => void;
  landedInMonth?: string | undefined;
}) {
  const t = useT();
  const { formatExpense, localeTag } = useI18n();
  const money = formatExpense(expense.amountCents, expense.currency, expense.baseCents);
  const category = categories.find((entry) => entry.id === expense.categoryId);

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
        <HStack
          gap="1.5"
          fontSize="xs"
          fontWeight="semibold"
          letterSpacing="0.08em"
          textTransform="uppercase"
        >
          <Text color="accent">{t('saved.title')}</Text>
          {landedInMonth ? (
            <>
              <Text color="fg.subtle" aria-hidden="true">
                ·
              </Text>
              <Text color="fg.muted">{t('saved.pastMonth')}</Text>
            </>
          ) : null}
        </HStack>
        <Text fontSize="sm" color="fg.muted">
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
