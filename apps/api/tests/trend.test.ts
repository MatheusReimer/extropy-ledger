import { describe, expect, it } from 'vitest';
import { buildTrend, monthsEndingAt } from '../src/reports/trend.js';

describe('monthsEndingAt', () => {
  it('returns the window oldest first, ending at the anchor', () => {
    expect(monthsEndingAt('2026-09', 3)).toEqual(['2026-07', '2026-08', '2026-09']);
  });

  /**
   * The reason this is integer arithmetic rather than `Date`: a naive
   * `setMonth(-1)` west of UTC can land in the wrong year, and a chart whose
   * first bar is silently mislabelled is worse than one that fails loudly.
   */
  it('crosses a year boundary correctly', () => {
    expect(monthsEndingAt('2026-02', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });

  it('handles January as the anchor', () => {
    expect(monthsEndingAt('2026-01', 2)).toEqual(['2025-12', '2026-01']);
  });

  it('handles December as the anchor without spilling into the next year', () => {
    expect(monthsEndingAt('2026-12', 2)).toEqual(['2026-11', '2026-12']);
  });

  it('returns a single month when asked for one', () => {
    expect(monthsEndingAt('2026-09', 1)).toEqual(['2026-09']);
  });

  it('returns nothing for a malformed anchor rather than guessing', () => {
    expect(monthsEndingAt('nonsense', 3)).toEqual([]);
  });
});

describe('buildTrend', () => {
  const months = ['2026-07', '2026-08', '2026-09'];

  it('lines totals up with their months', () => {
    const trend = buildTrend(months, [
      { month: '2026-08', totalCents: 12_376, count: 1 },
      { month: '2026-09', totalCents: 4_000, count: 2 },
    ]);

    expect(trend).toEqual([
      { month: '2026-07', totalCents: 0, expenseCount: 0 },
      { month: '2026-08', totalCents: 12_376, expenseCount: 1 },
      { month: '2026-09', totalCents: 4_000, expenseCount: 2 },
    ]);
  });

  /**
   * The database only knows about months that HAVE expenses, so a quiet month is
   * simply absent from the aggregation. Dropping it would draw a chart where
   * that month never happened and its neighbours sit side by side.
   */
  it('fills a quiet month with a zero rather than omitting it', () => {
    const trend = buildTrend(months, [{ month: '2026-09', totalCents: 500, count: 1 }]);
    expect(trend.map((point) => point.month)).toEqual(months);
    expect(trend[0]?.totalCents).toBe(0);
    expect(trend[1]?.totalCents).toBe(0);
  });

  it('ignores totals for months outside the window', () => {
    const trend = buildTrend(months, [
      { month: '2025-01', totalCents: 99_999, count: 9 },
      { month: '2026-08', totalCents: 100, count: 1 },
    ]);
    expect(trend.reduce((sum, point) => sum + point.totalCents, 0)).toBe(100);
  });

  it('returns an empty series for an empty window', () => {
    expect(buildTrend([], [{ month: '2026-08', totalCents: 1, count: 1 }])).toEqual([]);
  });
});
