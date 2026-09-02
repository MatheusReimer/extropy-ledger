import { Button } from '@chakra-ui/react';
import { toCsv, type CategoryDto, type ExpenseDto } from '@expense/shared';
import { useT } from '../i18n';
import { DownloadIcon } from './icons';

/**
 * Exports exactly what the user is looking at, filters included.
 *
 * Built in the browser from data already in the cache rather than through a new
 * endpoint. A server route would have to re-apply the same filters to agree with
 * the table - two implementations of one rule, and the day they diverge the file
 * quietly disagrees with the screen. It would also need the token in a query
 * string to be reachable by a plain link, which is how tokens end up in logs.
 *
 * Amounts are exported AS SPENT, with their currency in its own column. A single
 * converted column would bake today's rate into a file that outlives it.
 */
export function ExportButton({
  expenses,
  categories,
}: {
  expenses: ExpenseDto[];
  categories: CategoryDto[];
}) {
  const t = useT();
  const names = new Map(categories.map((category) => [category.id, category.name]));

  const download = () => {
    const csv = toCsv(
      [t('table.date'), t('table.description'), t('table.category'), t('table.amount'), 'Currency'],
      expenses.map((expense) => [
        expense.date,
        expense.description,
        names.get(expense.categoryId) ?? '',
        // Minor units back to a decimal string: plain, unformatted, no grouping
        // separator - a spreadsheet should parse this as a number, not as prose.
        (expense.amountCents / 100).toFixed(2),
        expense.currency,
      ]),
    );

    // A UTF-8 BOM, because Excel on Windows otherwise reads the file as the
    // system codepage and turns "Café" into "CafÃ©".
    const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `expenses-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    // Without this the blob is held for the lifetime of the document.
    URL.revokeObjectURL(url);
  };

  return (
    <Button
      size="xs"
      variant="outline"
      onClick={download}
      disabled={expenses.length === 0}
      title={t('export.hint')}
    >
      <DownloadIcon size={13} />
      {t('export.csv')}
    </Button>
  );
}
