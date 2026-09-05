import { BASE_CURRENCY, minorUnitDigits, minorUnitScale } from './currency.js';

/**
 * Amounts are integers in the currency's own MINOR UNITS - and how many of
 * those make a unit depends on the currency, which is the whole reason these
 * take one. USD has 100 cents to the dollar; JPY has 1 yen to the yen.
 */
export function parseAmountToMinorUnits(
  input: string | number,
  currency: string = BASE_CURRENCY,
): number | null {
  const raw = typeof input === 'number' ? input.toString() : input.trim().replace(',', '.');
  const digits = minorUnitDigits(currency);

  const pattern = digits === 0 ? /^\d{1,15}$/ : new RegExp(`^\\d{1,13}(\\.\\d{1,${digits}})?$`);
  if (!pattern.test(raw)) return null;

  const [whole = '0', frac = ''] = raw.split('.');
  const amount = Number(whole) * minorUnitScale(currency) + Number(frac.padEnd(digits, '0') || '0');
  return Number.isSafeInteger(amount) ? amount : null;
}

export function minorUnitsToDecimalString(
  amount: number,
  currency: string = BASE_CURRENCY,
): string {
  const digits = minorUnitDigits(currency);
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  if (digits === 0) return `${sign}${abs}`;

  const scale = minorUnitScale(currency);
  return `${sign}${Math.trunc(abs / scale)}.${String(abs % scale).padStart(digits, '0')}`;
}
