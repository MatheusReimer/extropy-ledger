import { useEffect, useRef, useState } from 'react';
import { Field, Grid, GridItem, Input, NativeSelect, SimpleGrid, Stack } from '@chakra-ui/react';
import type { ExpenseDto } from '@expense/shared';
import {
  useExpenses,
  useMonthlySummary,
  useTrend,
  useCategories,
  type ExpenseFilters,
} from '../api/hooks';
import {
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
  toDelta,
  TrendChart,
} from '../components';
import { ExpensesIcon, ReceiptIcon } from '../components/icons';
import { useI18n, useT } from '../i18n';
import { formatMonth, previousMonth, recentMonths } from '../lib/dates';

const MONTH_OPTIONS = recentMonths(12);

/**
 * The overview: what was spent this month, a way to add more, and the list.
 *
 * It owns its own queries rather than receiving them. React Query dedupes by
 * key, so the categories view asking for the same month costs one request
 * between them - which means neither view has to be handed data by the page,
 * and neither re-renders when the other's data changes.
 */
export function OverviewView({
  month,
  onMonthChange,
}: {
  month: string;
  /** Only for the auto-select below - the picker itself lives in the shell. */
  onMonthChange: (month: string) => void;
}) {
  const t = useT();
  const { formatBase } = useI18n();
  const [filters, setFilters] = useState<ExpenseFilters>({});
  const [editing, setEditing] = useState<ExpenseDto | undefined>(undefined);
  const [viewing, setViewing] = useState<ExpenseDto | undefined>(undefined);

  /**
   * Bars for months, a donut-free breakdown for categories.
   *
   * Horizontal bars for comparing categories, vertical bars for discrete months.
   */
  const [range, setRange] = useState<'month' | '6' | '12'>('month');

  const categories = useCategories();
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
   * Runs once, and never against a filtered list. After that the selector is the
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
    if (latest && MONTH_OPTIONS.includes(latest)) onMonthChange(latest);
  }, [expenses.data, month, noFilters, onMonthChange]);

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
      onMonthChange(savedMonth);
    }
  };

  const data = summary.data;
  const largest = data?.byCategory[0];
  const average =
    data && data.expenseCount > 0 ? Math.round(data.totalCents / data.expenseCount) : 0;

  return (
    <>
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
                      viewingMonth={month}
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
                    <SpendingChart data={data?.byCategory ?? []} />
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
      <ReceiptViewer expense={viewing} onClose={() => setViewing(undefined)} />
    </>
  );
}
