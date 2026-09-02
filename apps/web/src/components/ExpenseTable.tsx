import { Box, Button, HStack, Stack, Table, Text } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import type { CategoryDto, ExpenseDto } from '@expense/shared';
import { CategoryIcon } from './CategoryIcon';
import { useI18n, useT } from '../i18n';
import { ReceiptIcon } from './icons';
import { useDeleteExpense } from '../api/hooks';
import { formatDateShort } from '../lib/dates';
import { EmptyState, ErrorState } from './StateViews';

type Props = {
  expenses: ExpenseDto[];
  categories: CategoryDto[];
  onEdit: (expense: ExpenseDto) => void;
  onViewReceipt?: ((expense: ExpenseDto) => void) | undefined;
  /** Shown instead of the "no results" line when the account itself is empty. */
  emptyState?: ReactNode;
};

export function ExpenseTable({ expenses, categories, onEdit, onViewReceipt, emptyState }: Props) {
  const t = useT();
  const { formatExpense } = useI18n();
  const remove = useDeleteExpense();
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));

  if (expenses.length === 0) {
    // An empty ACCOUNT and an empty FILTER are different situations: one needs
    // teaching, the other needs a hint about the filter.
    return (
      emptyState ?? (
        <EmptyState title={t('table.emptyRange')} hint={t('table.emptyRangeHint')} />
      )
    );
  }

  return (
    <Stack gap="3">
      {remove.isError ? <ErrorState error={remove.error} /> : null}

      {/*
        `overflow-x: auto` on the wrapper, not the body: on a phone the table
        scrolls inside its own card instead of shoving the whole page sideways.
      */}
      <Table.ScrollArea borderWidth="1px" borderColor="border.subtle" borderRadius="card">
        <Table.Root size="sm" stickyHeader interactive variant="line">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader fontSize="xs" letterSpacing="0.05em" textTransform="uppercase" color="fg.subtle">{t('table.date')}</Table.ColumnHeader>
              <Table.ColumnHeader fontSize="xs" letterSpacing="0.05em" textTransform="uppercase" color="fg.subtle">{t('table.description')}</Table.ColumnHeader>
              <Table.ColumnHeader fontSize="xs" letterSpacing="0.05em" textTransform="uppercase" color="fg.subtle">{t('table.category')}</Table.ColumnHeader>
              <Table.ColumnHeader textAlign="end" fontSize="xs" letterSpacing="0.05em" textTransform="uppercase" color="fg.subtle">{t('table.amount')}</Table.ColumnHeader>
              <Table.ColumnHeader textAlign="end" fontSize="xs" letterSpacing="0.05em" textTransform="uppercase" color="fg.subtle" width="1%"></Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {expenses.map((expense) => {
              const money = formatExpense(expense.amountCents, expense.currency, expense.baseCents);
              return (
              <Table.Row key={expense.id} _hover={{ bg: "bg.raised" }}>
                <Table.Cell whiteSpace="nowrap" color="fg.muted">
                  {formatDateShort(expense.date)}
                </Table.Cell>
                <Table.Cell maxW="0" width="45%">
                  {/*
                    `maxW="0"` with a percentage width is the table idiom for
                    "let this column shrink". Without it the cell grows to fit
                    its text and shoves every column after it off the screen -
                    which a long extracted description does immediately.
                  */}
                  <Text truncate title={expense.description}>
                    {expense.description}
                  </Text>
                </Table.Cell>
                <Table.Cell>
                  {/* A glyph rather than a coloured pill: shape reads the same
                      to every viewer, and eleven categories overrun the point
                      where any categorical palette stays separable. */}
                  <HStack gap="2">
                    <Box color="accent">
                      <CategoryIcon name={categoryNames.get(expense.categoryId) ?? ''} size={15} />
                    </Box>
                    <Text whiteSpace="nowrap">
                      {categoryNames.get(expense.categoryId) ?? 'Unknown'}
                    </Text>
                  </HStack>
                </Table.Cell>
                {/*
                  Right-aligned and tabular: a money column is read by comparison.

                  Shows what was SPENT, in the currency it was spent in - never a
                  converted figure dressed up as the original. The equivalent sits
                  underneath, marked approximate, and appears only when it says
                  something the line above does not.
                */}
                <Table.Cell textAlign="end" whiteSpace="nowrap">
                  <Text fontWeight="medium">{money.original}</Text>
                  {money.converted ? (
                    <Text fontSize="xs" color="fg.subtle">
                      {t('money.approx', { amount: money.converted })}
                    </Text>
                  ) : null}
                </Table.Cell>
                <Table.Cell textAlign="end">
                  <HStack gap="1" justify="end">
                    {/* Only offered when there is something to show - a dead
                        button on every row would teach people to ignore it. */}
                    {expense.receiptId && onViewReceipt ? (
                      <Button
                        size="xs"
                        variant="ghost"
                        color="accent"
                        onClick={() => onViewReceipt(expense)}
                      >
                        <ReceiptIcon size={14} />
                        {t('receipt.view')}
                      </Button>
                    ) : null}
                    <Button size="xs" variant="ghost" onClick={() => onEdit(expense)}>
                      {t('table.edit')}
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      colorPalette="red"
                      loading={remove.isPending && remove.variables === expense.id}
                      onClick={() => remove.mutate(expense.id)}
                    >
                      {t('table.delete')}
                    </Button>
                  </HStack>
                </Table.Cell>
              </Table.Row>
              );
            })}
          </Table.Body>
        </Table.Root>
      </Table.ScrollArea>
    </Stack>
  );
}
