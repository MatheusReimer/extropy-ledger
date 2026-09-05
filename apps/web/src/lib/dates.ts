const pad = (value: number): string => String(value).padStart(2, '0');

export function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export const currentMonth = (): string => todayIso().slice(0, 7);

export function formatMonth(month: string): string {
  const [year, monthPart] = month.split('-');
  if (!year || !monthPart) return month;
  const date = new Date(Number(year), Number(monthPart) - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function formatDateShort(date: string): string {
  const [year, month, day] = date.split('-');
  if (!year || !month || !day) return date;
  return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export function recentMonths(count: number): string[] {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
  });
}

export function previousMonth(month: string): string {
  const [year, monthPart] = month.split('-').map(Number);
  if (!year || !monthPart) return month;
  return monthPart === 1 ? `${year - 1}-12` : `${year}-${String(monthPart - 1).padStart(2, '0')}`;
}
