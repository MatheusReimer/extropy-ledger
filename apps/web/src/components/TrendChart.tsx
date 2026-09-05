import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { Box, Text } from '@chakra-ui/react';
import type { MonthlyTrendPoint } from '@expense/shared';
import { EmptyState } from './StateViews';
import { useI18n, useT } from '../i18n';

const SERIES_COLOR = '#b4551f';
const MUTED_COLOR = '#e0c9b4';
const GRID_COLOR = '#e4dccf';
const AXIS_TEXT = '#6b5e52';

function shortMonth(month: string): string {
  const [year, monthPart] = month.split('-').map(Number);
  if (!year || !monthPart) return month;
  const label = new Date(year, monthPart - 1, 1).toLocaleDateString('en-US', { month: 'short' });
  return monthPart === 1 ? `${label} ${String(year).slice(2)}` : label;
}

type TooltipPayload = { payload: MonthlyTrendPoint }[];

function TrendTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload }) {
  const t = useT();
  const { formatBase, localeTag } = useI18n();
  const point = active ? payload?.[0]?.payload : undefined;
  if (!point) return null;

  const [year, monthPart] = point.month.split('-').map(Number);
  const title =
    year && monthPart
      ? new Date(year, monthPart - 1, 1).toLocaleDateString(localeTag, {
          month: 'long',
          year: 'numeric',
        })
      : point.month;

  return (
    <Box
      bg="bg.panel"
      borderWidth="1px"
      borderColor="border.emphasized"
      borderRadius="control"
      px="3"
      py="2"
    >
      <Text fontWeight="medium" fontSize="sm">
        {title}
      </Text>
      <Text fontSize="sm">{formatBase(point.totalCents)}</Text>
      <Text fontSize="xs" color="fg.muted">
        {point.expenseCount}{' '}
        {point.expenseCount === 1 ? t('categories.expense') : t('categories.expenses')}
      </Text>
    </Box>
  );
}

export function TrendChart({
  data,
  selectedMonth,
}: {
  data: MonthlyTrendPoint[];
  selectedMonth: string;
}) {
  const t = useT();

  if (data.length === 0) {
    return <EmptyState title={t('breakdown.noHistory')} hint={t('breakdown.noHistoryHint')} />;
  }

  return (
    <Box height="260px" width="full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 8, right: 4, bottom: 0, left: 4 }}
          barCategoryGap="22%"
        >
          <CartesianGrid vertical={false} stroke={GRID_COLOR} />
          <XAxis
            dataKey="month"
            tickFormatter={shortMonth}
            tickLine={false}
            axisLine={false}
            tick={{ fill: AXIS_TEXT, fontSize: 12 }}
            interval="preserveStartEnd"
          />
          <Tooltip content={<TrendTooltip />} cursor={{ fill: 'rgba(180, 85, 31, 0.07)' }} />
          <Bar
            dataKey="totalCents"
            radius={[4, 4, 0, 0]}
            maxBarSize={54}
            animationDuration={620}
            animationEasing="ease-out"
          >
            {data.map((point) => (
              <Cell
                key={point.month}
                fill={point.month === selectedMonth ? SERIES_COLOR : MUTED_COLOR}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}
