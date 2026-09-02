import { useMemo } from 'react';
import { Badge, HStack, SimpleGrid, Stack, Text, Wrap } from '@chakra-ui/react';
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

/**
 * Where the money went, and what was set aside for it.
 *
 * Split out of the dashboard page because it answers a different question from
 * the overview and shares nothing with it but the selected month - which the
 * shell owns. Its queries are its own; React Query serves the summary from cache
 * when the overview has already asked for the same month.
 */
export function CategoriesView({ month }: { month: string }) {
  const t = useT();
  const categories = useCategories();
  const budgets = useBudgets();
  const setBudget = useSetBudget();
  const summary = useMonthlySummary(month);

  const data = summary.data;
  const budgetList = budgets.data ?? [];
  const budgetByCategory = useMemo(
    () => new Map(budgetList.map((budget) => [budget.categoryId, budget.limitCents])),
    [budgetList],
  );
  const categoryNames = useMemo(
    () => new Map((categories.data ?? []).map((category) => [category.id, category.name])),
    [categories.data],
  );

  const spentByCategory = data?.byCategory ?? [];

  /**
   * Every category worth a card: those spent in this month, plus those with a
   * budget and nothing spent against it yet.
   *
   * The second group matters more than it looks. "You set aside $200 for Travel
   * and have spent nothing" is real information, and dropping those rows would
   * make a budget vanish from the page the moment it was doing its job.
   */
  const byCategory = useMemo(() => {
    const spentIds = new Set(spentByCategory.map((entry) => entry.categoryId));
    const unspent = budgetList
      .filter((budget) => !spentIds.has(budget.categoryId))
      .map((budget) => ({
        categoryId: budget.categoryId,
        name: categoryNames.get(budget.categoryId) ?? '',
        totalCents: 0,
        count: 0,
      }))
      // A category deleted from under its budget has no name to show.
      .filter((entry) => entry.name !== '');
    return [...spentByCategory, ...unspent];
  }, [spentByCategory, budgetList, categoryNames]);

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
        <Stack gap="5">
          <Wrap gap="2">
            {(categories.data ?? []).map((category) => (
              <Badge
                key={category.id}
                size="sm"
                variant={category.isCustom ? 'solid' : 'subtle'}
                colorPalette={category.isCustom ? 'orange' : 'gray'}
                borderRadius="full"
                px="2.5"
              >
                {category.name}
              </Badge>
            ))}
          </Wrap>
          <HStack>
            {categories.data ? <CategoryManager categories={categories.data} /> : null}
          </HStack>
        </Stack>
      </Panel>
    </Stack>
  );
}
