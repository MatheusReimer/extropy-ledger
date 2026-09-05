import { useMemo } from 'react';
import { SimpleGrid, Stack, Text } from '@chakra-ui/react';
import { useBudgets, useCategories, useMonthlySummary, useSetBudget } from '../api/hooks';
import {
  CategoryCard,
  CategoryManager,
  ErrorState,
  LoadingState,
  Panel,
  PanelHeading,
} from '../components';
import { useT } from '../i18n';
import { formatMonth } from '../lib/dates';

export function CategoriesView({ month }: { month: string }) {
  const t = useT();
  const categories = useCategories();
  const budgets = useBudgets();
  const setBudget = useSetBudget();
  const summary = useMonthlySummary(month);

  const data = summary.data;
  const budgetByCategory = useMemo(
    () => new Map((budgets.data ?? []).map((budget) => [budget.categoryId, budget.limitCents])),
    [budgets.data],
  );
  const categoryNames = useMemo(
    () => new Map((categories.data ?? []).map((category) => [category.id, category.name])),
    [categories.data],
  );

  const byCategory = useMemo(() => {
    const spent = data?.byCategory ?? [];
    const spentIds = new Set(spent.map((entry) => entry.categoryId));
    const unspent = (budgets.data ?? [])
      .filter((budget) => !spentIds.has(budget.categoryId))
      .map((budget) => ({
        categoryId: budget.categoryId,
        name: categoryNames.get(budget.categoryId) ?? '',
        totalCents: 0,
        count: 0,
      }))
      .filter((entry) => entry.name !== '');
    return [...spent, ...unspent];
  }, [data?.byCategory, budgets.data, categoryNames]);

  const largest = byCategory[0];

  return (
    <Stack gap={{ base: '4', md: '5' }}>
      <Panel>
        <PanelHeading title={formatMonth(month)} hint={t('categories.byCategory')} />
        {summary.isPending ? <LoadingState /> : null}
        {summary.isError ? <ErrorState error={summary.error} /> : null}
        {data && byCategory.length > 0 ? (
          <SimpleGrid columns={{ base: 1, sm: 2, xl: 3 }} gap="3">
            {byCategory.map((breakdown) => (
              <CategoryCard
                key={breakdown.categoryId}
                breakdown={breakdown}
                largestCents={largest?.totalCents ?? 0}
                totalCents={data.totalCents}
                limitCents={budgetByCategory.get(breakdown.categoryId)}
                savingBudget={setBudget.isPending}
                onSetBudget={(limitCents) =>
                  setBudget.mutate({ categoryId: breakdown.categoryId, limitCents })
                }
              />
            ))}
          </SimpleGrid>
        ) : data ? (
          <Text fontSize="sm" color="fg.muted">
            {t('categories.nothingIn', { month: formatMonth(month) })}
          </Text>
        ) : null}
      </Panel>

      <Panel>
        <PanelHeading title={t('categories.yours')} hint={t('categories.standard')} />
        {categories.data ? <CategoryManager categories={categories.data} /> : null}
      </Panel>
    </Stack>
  );
}
