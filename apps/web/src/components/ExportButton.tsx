import { Button } from '@chakra-ui/react';
import { toCsv, type CategoryDto, type ExpenseDto } from '@expense/shared';
import { useT } from '../i18n';
import { DownloadIcon } from './icons';

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
        (expense.amountCents / 100).toFixed(2),
        expense.currency,
      ]),
    );

    const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `expenses-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
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
