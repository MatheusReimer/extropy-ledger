import { describe, expect, it } from 'vitest';
import {
  convertMinorUnits,
  formatMoney,
  isCurrency,
  isLocale,
  minorUnitDigits,
  LOCALE_TAGS,
} from '../src/currency.js';

describe('convertMinorUnits', () => {
  it('applies a rate and rounds to whole minor units', () => {
    // R$500.00 at 0.1924 USD/BRL
    expect(convertMinorUnits(50_000, 0.1924, 'BRL', 'USD')).toBe(9_620);
  });

  it('is exact at parity', () => {
    expect(convertMinorUnits(12_376, 1, 'USD', 'USD')).toBe(12_376);
  });

  /**
   * The bug this signature exists to stop.
   *
   * A rate is quoted in whole currency units, so converting between currencies
   * with DIFFERENT minor-unit exponents has to rescale. It did not: 15000 yen
   * at 0.0063 stored 94 cents - ninety-four cents instead of ninety-four
   * dollars. Only the formatter was exponent-aware; the conversion was not.
   */
  it('rescales between currencies with different minor units', () => {
    // JPY 15,000 at 0.0063 USD/JPY is about USD 94.50 -> 9450 cents, not 94.
    expect(convertMinorUnits(15_000, 0.0063, 'JPY', 'USD')).toBe(9_450);
    // And back: USD 94.50 at 158.73 JPY/USD is about JPY 15,000.
    expect(convertMinorUnits(9_450, 158.73, 'USD', 'JPY')).toBe(15_000);
  });

  /**
   * Rounding happens once, from the original.
   *
   * A round trip is allowed to drift by a minor unit - that is unavoidable with
   * a float rate - but it must not drift further. This is the reason nothing in
   * the app converts an already-converted value: the drift compounds, and on a
   * column of money it becomes visible as rows that no longer add up.
   */
  it('keeps a round trip within one minor unit', () => {
    const original = 9_999;
    const there = convertMinorUnits(original, 5.1989, 'USD', 'BRL');
    const back = convertMinorUnits(there, 1 / 5.1989, 'BRL', 'USD');
    expect(there).toBe(51_984);
    expect(Math.abs(back - original)).toBeLessThanOrEqual(1);
  });

  /**
   * `100 * 1.005` is 100.49999999999999 in binary floating point, so this rounds
   * DOWN. That is inherent to converting with a float rate and is precisely why
   * the original amount is always kept: the stored value never inherits this,
   * only the displayed conversion does.
   */
  it('rounds the float product, halves included, without pretending to be exact', () => {
    expect(convertMinorUnits(100, 1.005, 'USD', 'EUR')).toBe(100);
    expect(100 * 1.005).toBeLessThan(100.5);
  });
});

describe('minorUnitDigits', () => {
  it('reads the exponent from Intl rather than a table of ours', () => {
    expect(minorUnitDigits('USD')).toBe(2);
    expect(minorUnitDigits('BRL')).toBe(2);
    expect(minorUnitDigits('JPY')).toBe(0);
  });

  /** An unknown code must not throw; two decimals is the safe assumption. */
  it('falls back to two for a code Intl does not know', () => {
    expect(minorUnitDigits('XTS')).toBe(2);
  });
});

describe('formatMoney', () => {
  it('uses the currency it is given, not a default', () => {
    // The bug this guards: every amount used to be printed with a dollar sign.
    expect(formatMoney(12_376, 'USD', 'en-US')).toBe('$123.76');
    // Not merely "contains a dollar sign": R$123.76 contains one too. What
    // matters is that a BRL amount does not START with a bare $.
    expect(formatMoney(12_376, 'BRL', 'en-US').startsWith('$')).toBe(false);
    expect(formatMoney(12_376, 'BRL', 'en-US')).toContain('R$');
  });

  it('follows the locale for separators and symbol placement', () => {
    const ptBr = formatMoney(123_456, 'BRL', LOCALE_TAGS.pt);
    expect(ptBr).toContain('R$');
    // pt-BR groups with dots and decimalises with a comma.
    expect(ptBr).toContain('1.234,56');
  });

  /**
   * JPY has no minor units, so its minor unit IS the yen. Hardcoding a divide
   * by 100 would report every yen amount as a hundredth of itself.
   */
  it('respects currencies with no minor unit', () => {
    expect(formatMoney(1_234, 'JPY', 'en-US')).toContain('1,234');
    expect(formatMoney(1_234, 'JPY', 'en-US')).not.toContain('12.34');
  });
});

describe('guards', () => {
  it('accepts supported codes and rejects the rest', () => {
    expect(isCurrency('BRL')).toBe(true);
    expect(isCurrency('XYZ')).toBe(false);
    expect(isCurrency('brl')).toBe(false);
  });

  it('narrows locales the same way', () => {
    expect(isLocale('pt')).toBe(true);
    expect(isLocale('de')).toBe(false);
  });
});
