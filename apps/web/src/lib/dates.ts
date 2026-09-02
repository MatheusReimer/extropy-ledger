/**
 * Dates in this app are `YYYY-MM-DD` strings - the same decision as the backend,
 * for the same reason: an expense happens on a day, not at an instant. Nothing
 * here builds a `Date` from a user string, which is where the timezone usually
 * lets itself in uninvited.
 */

const pad = (value: number): string => String(value).padStart(2, '0');

/** Today in the browser's LOCAL zone - `toISOString()` gives UTC and gets the day wrong. */
export function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export const currentMonth = (): string => todayIso().slice(0, 7);

/** `2026-09` -> `September 2026`. */
export function formatMonth(month: string): string {
  const [year, monthPart] = month.split('-');
  if (!year || !monthPart) return month;
  const date = new Date(Number(year), Number(monthPart) - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/** `2026-09-14` -> `Sep 14`. The year is omitted: the list is already filtered by period. */
export function formatDateShort(date: string): string {
  const [year, month, day] = date.split('-');
  if (!year || !month || !day) return date;
  return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/** The last N months, newest first, for the report selector. */
export function recentMonths(count: number): string[] {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
  });
}

/**
 * `2026-09` -> `2026-08`, rolling the year over correctly.
 *
 * Built from the numbers rather than a `Date`, so January cannot wander into a
 * timezone-shifted December the way `setMonth(-1)` can.
 */
export function previousMonth(month: string): string {
  const [year, monthPart] = month.split('-').map(Number);
  if (!year || !monthPart) return month;
  return monthPart === 1
    ? `${year - 1}-12`
    : `${year}-${String(monthPart - 1).padStart(2, '0')}`;
}
