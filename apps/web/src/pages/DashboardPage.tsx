import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Badge,
  Field,
  Grid,
  GridItem,
  HStack,
  Input,
  NativeSelect,
  SimpleGrid,
  Stack,
  Text,
  Wrap,
} from '@chakra-ui/react';
import type { ExpenseDto } from '@expense/shared';
import {
  useBudgets,
  useCategories,
  useExpenses,
  useMonthlySummary,
  useSetBudget,
  useTrend,
  type ExpenseFilters,
} from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import {
  CategoryCard,
  CategoryManager,
  ErrorState,
  ExpenseForm,
  ExpenseTable,
  ExportButton,
  FirstRun,
  LoadingState,
  Panel,
  PanelHeading,
  ReceiptViewer,
  Rise,
  Segmented,
  SpendingChart,
  StatCard,
  StatRow,
  TrendChart,
  toDelta,
} from '../components';

import { AppLayout, type ViewKey } from '../components/layout/AppLayout';
import { useI18n, useT } from '../i18n';
import { ExpensesIcon, ReceiptIcon } from '../components/icons';
import { currentMonth, formatMonth, previousMonth, recentMonths } from '../lib/dates';

const MONTH_OPTIONS = recentMonths(12);

/** "matheus@example.com" -> "Matheus". A greeting should use a name, not an address. */
function greetingName(email: string | undefined): string {
  const local = email?.split('@')[0] ?? '';
  const word = local.split(/[._-]/)[0] ?? '';
  return word ? word.charAt(0).toUpperCase() + word.slice(1) : 'there';
}

export function DashboardPage() {
  const t = useT();
  // Totals are base-currency figures; the formatter converts them once, for display.
  const { formatBase } = useI18n();
  const { session, signOut } = useAuth();
  const [view, setView] = useState<ViewKey>('overview');
  const [month, setMonth] = useState(currentMonth);
  const [filters, setFilters] = useState<ExpenseFilters>({});
  const [editing, setEditing] = useState<ExpenseDto | undefined>(undefined);
  const [viewing, setViewing] = useState<ExpenseDto | undefined>(undefined);

  /**
   * Which question the breakdown panel is answering.
   *
   * Not a chart-type switch. "By category" and "over time" are different
   * questions, and each gets the form that suits it - horizontal bars for
   * comparing categories, vertical bars for discrete months. Offering a donut of
   * the same data would be a second shape for one question, which is decoration.
   */
  const [range, setRange] = useState<'month' | '6' | '12'>('month');

  const categories = useCategories();
  const budgets = useBudgets();
  const setBudget = useSetBudget();
  const expenses = useExpenses(filters);
  const summary = useMonthlySummary(month);
  // The previous month exists only to give the stat cards a baseline. It is a
  // separate query so a slow or missing prior month never blocks this one.
  const prior = useMonthlySummary(previousMonth(month));
  const trend = useTrend(month, range === '12' ? 12 : 6);

  // No filters applied AND nothing came back means the account is empty, not
  // that the filter was too narrow.
  const noFilters = !filters.from && !filters.to && !filters.categoryId;
  const accountEmpty = noFilters && expenses.data?.length === 0;

  /**
   * On first load, land on a month that actually has something in it.
   *
   * Defaulting to today's month is right only if today's month has data. A
   * receipt dated the 14th of last month puts the only expense in August while
   * the page opens on September, and every figure reads zero next to a list that
   * plainly shows a row - which looks like a broken dashboard rather than an
   * empty month.
   *
   * Runs once, and never against a filtered list, so it can only ever choose the
   * month of the genuinely most recent expense. After that the selector is the
   * user's; nothing here fights an explicit choice.
   */
  const autoSelected = useRef(false);
  useEffect(() => {
    if (autoSelected.current || !noFilters) return;
    const rows = expenses.data;
    if (!rows || rows.length === 0) return;

    autoSelected.current = true;
    if (rows.some((expense) => expense.date.slice(0, 7) === month)) return;

    // The API returns newest first, so the head is the latest expense.
    const latest = rows[0]?.date.slice(0, 7);
    if (latest && MONTH_OPTIONS.includes(latest)) setMonth(latest);
  }, [expenses.data, month, noFilters]);

  /**
   * Follow a saved expense to the month it belongs to.
   *
   * A receipt dated the 14th of LAST month creates a last-month expense, so this
   * month's totals correctly do not move - which looks exactly like a broken
   * dashboard. Rather than explain the discrepancy, the page goes where the
   * money went.
   */
  const handleSaved = (saved?: ExpenseDto) => {
    setEditing(undefined);
    const savedMonth = saved?.date.slice(0, 7);
    if (savedMonth && savedMonth !== month && MONTH_OPTIONS.includes(savedMonth)) {
      setMonth(savedMonth);
    }
  };

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
  const average =
    data && data.expenseCount > 0 ? Math.round(data.totalCents / data.expenseCount) : 0;

  const monthPicker = (
    <NativeSelect.Root size="sm" width={{ base: 'full', sm: '44' }}>
      <NativeSelect.Field
        value={month}
        onChange={(event) => setMonth(event.target.value)}
        aria-label="Report month"
        borderRadius="control"
      >
        {MONTH_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {formatMonth(option)}
          </option>
        ))}
      </NativeSelect.Field>
      <NativeSelect.Indicator />
    </NativeSelect.Root>
  );

  const headings: Record<ViewKey, { title: string; subtitle: string }> = {
    overview: {
      title: t('nav.overview'),
      subtitle: t('overview.greeting', { name: greetingName(session?.user.email) }),
    },
    categories: { title: t('nav.categories'), subtitle: t('overview.categoriesSubtitle') },
  };

  return (
    <AppLayout
      view={view}
      onViewChange={setView}
      email={session?.user.email}
      onSignOut={signOut}
      title={headings[view].title}
      subtitle={headings[view].subtitle}
      action={monthPicker}
    >
      {view === 'overview' ? (
        <Stack gap={{ base: '4', md: '5' }}>
          {summary.isError ? <ErrorState error={summary.error} /> : null}
          {summary.isPending ? <LoadingState label={t('state.buildingReport')} /> : null}

          {data ? (
            <>
              <Rise>
              <StatRow>
                <StatCard
                  label={t('stats.totalSpent')}
                  cents={data.totalCents}
                  format={formatBase}
                  delta={toDelta(data.totalCents, prior.data?.totalCents ?? 0, t('stats.vsLastMonth'))}
                  hint={formatMonth(month)}
                />
                <StatCard
                  label={t('stats.expenses')}
                  cents={data.expenseCount}
                  format={String}
                  icon={<ExpensesIcon size={16} />}
                  delta={toDelta(data.expenseCount, prior.data?.expenseCount ?? 0, t('stats.vsLastMonth'))}
                  hint={data.expenseCount === 1 ? t('stats.entry') : t('stats.entries')}
                />
                <StatCard label={t('stats.average')} cents={average} format={formatBase} hint={t('stats.perExpense')} />
                <StatCard
                  label={t('stats.largest')}
                  cents={largest?.totalCents ?? 0}
                  format={formatBase}
                  hint={largest?.name ?? t('stats.nothingYet')}
                />
              </StatRow>
              </Rise>

              <Rise delay={70}>
              <Grid
                templateColumns={{ base: '1fr', lg: '1fr 1fr' }}
                gap={{ base: '4', md: '5' }}
                alignItems="start"
              >
                <GridItem minW="0">
                  <Panel>
                    <PanelHeading
                      title={editing ? t('form.editTitle') : t('form.addTitle')}
                      hint={editing ? t('form.editHint') : t('form.addHint')}
                      icon={<ReceiptIcon size={16} />}
                    />
                    {categories.isPending ? <LoadingState label={t('state.loadingCategories')} /> : null}
                    {categories.isError ? <ErrorState error={categories.error} /> : null}
                    {categories.data ? (
                      <ExpenseForm
                        categories={categories.data}
                        editing={editing}
                        onDone={handleSaved}
                        compact
                      />
                    ) : null}
                  </Panel>
                </GridItem>

                <GridItem minW="0">
                  <Panel>
                    <PanelHeading
                      title={t('breakdown.title')}
                      action={
                        <Segmented
                          name="breakdown-range"
                          label={t('breakdown.rangeLabel')}
                          value={range}
                          onChange={setRange}
                          options={[
                            { value: 'month', label: t('breakdown.byCategory') },
                            { value: '6', label: t('breakdown.sixMonths') },
                            { value: '12', label: t('breakdown.twelveMonths') },
                          ]}
                        />
                      }
                    />
                    {range === 'month' ? (
                      <SpendingChart data={byCategory} />
                    ) : trend.isError ? (
                      <ErrorState error={trend.error} />
                    ) : trend.data ? (
                      <TrendChart data={trend.data} selectedMonth={month} />
                    ) : (
                      <LoadingState />
                    )}
                  </Panel>
                </GridItem>
              </Grid>
              </Rise>

              <Rise delay={140}>
              <Panel>
                <PanelHeading
                  title={t('expenses.title')}
                  hint={t('expenses.newestFirst')}
                  action={
                    <ExportButton
                      expenses={expenses.data ?? []}
                      categories={categories.data ?? []}
                    />
                  }
                />
                <Stack gap="5">
                  <SimpleGrid columns={{ base: 1, md: 3 }} gap="3">
                    <Field.Root>
                      <Field.Label fontSize="xs" color="fg.subtle">
                        {t('filters.from')}
                      </Field.Label>
                      <Input
                        size="sm"
                        type="date"
                        borderRadius="control"
                        value={filters.from ?? ''}
                        onChange={(event) =>
                          setFilters({ ...filters, from: event.target.value || undefined })
                        }
                      />
                    </Field.Root>
                    <Field.Root>
                      <Field.Label fontSize="xs" color="fg.subtle">
                        {t('filters.to')}
                      </Field.Label>
                      <Input
                        size="sm"
                        type="date"
                        borderRadius="control"
                        value={filters.to ?? ''}
                        onChange={(event) =>
                          setFilters({ ...filters, to: event.target.value || undefined })
                        }
                      />
                    </Field.Root>
                    <Field.Root>
                      <Field.Label fontSize="xs" color="fg.subtle">
                        {t('filters.category')}
                      </Field.Label>
                      <NativeSelect.Root size="sm">
                        <NativeSelect.Field
                          borderRadius="control"
                          value={filters.categoryId ?? ''}
                          onChange={(event) =>
                            setFilters({ ...filters, categoryId: event.target.value || undefined })
                          }
                        >
                          <option value="">{t('filters.allCategories')}</option>
                          {(categories.data ?? []).map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.name}
                            </option>
                          ))}
                        </NativeSelect.Field>
                        <NativeSelect.Indicator />
                      </NativeSelect.Root>
                    </Field.Root>
                  </SimpleGrid>

                  {expenses.isPending ? <LoadingState /> : null}
                  {expenses.isError ? <ErrorState error={expenses.error} /> : null}
                  {expenses.data ? (
                    <ExpenseTable
                      expenses={expenses.data}
                      categories={categories.data ?? []}
                      emptyState={accountEmpty ? <FirstRun /> : undefined}
                      onViewReceipt={setViewing}
                      onEdit={setEditing}
                    />
                  ) : null}
                </Stack>
              </Panel>
              </Rise>
            </>
          ) : null}
        </Stack>
      ) : null}

      {view === 'categories' ? (
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
      ) : null}
      <ReceiptViewer expense={viewing} onClose={() => setViewing(undefined)} />
    </AppLayout>
  );
}
