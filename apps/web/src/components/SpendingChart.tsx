import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Box, Text } from '@chakra-ui/react';
import type { CategoryBreakdown } from '@expense/shared';
import { EmptyState } from './StateViews';
import { useI18n, useT } from '../i18n';

const SERIES_COLOR = '#b4551f';
const GRID_COLOR = '#e4dccf';
const AXIS_TEXT = '#6b5e52';

const ROW_HEIGHT = 34;
const CHART_PADDING = 24;

type TooltipPayload = { payload: CategoryBreakdown }[];

function ChartTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload }) {
  const t = useT();
  const { formatBase } = useI18n();
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row) return null;

  return (
    <Box
      bg="bg.panel"
      borderWidth="1px"
      borderColor="border.emphasized"
      borderRadius="control"
      px="3"
      py="2"
    >
      <Text fontWeight="medium">{row.name}</Text>
      <Text fontSize="sm" fontVariantNumeric="tabular-nums">
        {formatBase(row.totalCents)}
      </Text>
      <Text fontSize="xs" color="fg.muted">
        {row.count} {row.count === 1 ? t('categories.expense') : t('categories.expenses')}
      </Text>
    </Box>
  );
}

export function SpendingChart({ data }: { data: CategoryBreakdown[] }) {
  const t = useT();
  const { formatBase } = useI18n();

  if (data.length === 0) {
    return <EmptyState title={t('breakdown.empty')} hint={t('breakdown.emptyHint')} />;
  }

  return (
    <Box height={`${data.length * ROW_HEIGHT + CHART_PADDING * 2}px`} width="full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: CHART_PADDING / 2, right: 72, bottom: CHART_PADDING / 2, left: 0 }}
          barCategoryGap={6}
        >
          <CartesianGrid horizontal={false} stroke={GRID_COLOR} />
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            width={120}
            tickLine={false}
            axisLine={false}
            tick={{ fill: AXIS_TEXT, fontSize: 12 }}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(180, 85, 31, 0.07)' }} />
          <Bar
            dataKey="totalCents"
            fill={SERIES_COLOR}
            radius={[0, 4, 4, 0]}
            maxBarSize={22}
            animationDuration={620}
            animationEasing="ease-out"
          >
            <LabelList
              dataKey="totalCents"
              position="right"
              formatter={(value) => (typeof value === 'number' ? formatBase(value) : '')}
              style={{ fill: AXIS_TEXT, fontSize: 12 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}
