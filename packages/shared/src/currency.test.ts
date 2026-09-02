import { describe, expect, it } from 'vitest';
import { convertCents, formatMoney, isCurrency, isLocale, LOCALE_TAGS } from './currency.js';

describe('convertCents', () => {
  it('applies a rate and rounds to whole minor units', () => {
    // R$500.00 at 0.1924 USD/BRL
    expect(convertCents(50_000, 0.1924)).toBe(9_620);
  });

  it('is exact at parity', () => {
    expect(convertCents(12_376, 1)).toBe(12_376);
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
    const there = convertCents(original, 5.1989);
    const back = convertCents(there, 1 / 5.1989);
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
    expect(convertCents(100, 1.005)).toBe(100);
    expect(100 * 1.005).toBeLessThan(100.5);
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
   * JPY has no minor units, so its "cents" are whole yen. Hardcoding a divide by
   * 100 would report every yen amount as a hundredth of itself.
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
