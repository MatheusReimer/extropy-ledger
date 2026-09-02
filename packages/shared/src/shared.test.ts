import { describe, expect, it } from 'vitest';
import { centsToDecimalString, formatCents, parseAmountToCents } from './money.js';
import { sanitizeText } from './sanitize.js';
import { createExpenseSchema, listExpensesQuerySchema } from './schemas/expense.js';
import { signupSchema } from './schemas/auth.js';
import { parseOrFieldErrors } from './validation.js';

describe('parseAmountToCents', () => {
  it('parses whole and decimal amounts', () => {
    expect(parseAmountToCents('12')).toBe(1_200);
    expect(parseAmountToCents('12.5')).toBe(1_250);
    expect(parseAmountToCents('12.34')).toBe(1_234);
  });

  it('accepts a comma as the decimal separator', () => {
    expect(parseAmountToCents('12,34')).toBe(1_234);
  });

  /**
   * Why cents exist at all: 0.1 + 0.2 is not 0.3 in binary floating point.
   * Adding expenses as decimals accumulates error that surfaces in the month total.
   */
  it('keeps sums exact where floating point would drift', () => {
    const cents = [0.1, 0.2, 0.3].map((value) => parseAmountToCents(value) ?? 0);
    expect(cents.reduce((sum, value) => sum + value, 0)).toBe(60);
    expect(0.1 + 0.2 + 0.3).not.toBe(0.6);
  });

  it('rejects anything that is not a plain amount', () => {
    for (const input of ['', 'abc', '-5', '1.234', '1e5', '  ']) {
      expect(parseAmountToCents(input)).toBeNull();
    }
  });
});

describe('centsToDecimalString', () => {
  it('always pads to two decimals', () => {
    expect(centsToDecimalString(1_200)).toBe('12.00');
    expect(centsToDecimalString(5)).toBe('0.05');
  });

  it('round-trips through parseAmountToCents', () => {
    for (const cents of [1, 99, 100, 123_456]) {
      expect(parseAmountToCents(centsToDecimalString(cents))).toBe(cents);
    }
  });

  it('formats as currency for display', () => {
    expect(formatCents(1_234)).toBe('$12.34');
  });
});

describe('sanitizeText', () => {
  it('collapses whitespace and trims', () => {
    expect(sanitizeText('  Coffee   at   Starbucks  ')).toBe('Coffee at Starbucks');
  });

  it('strips control characters that would corrupt logs and indexes', () => {
    expect(sanitizeText('Cof\u0007fee\u001b[31m')).toBe('Coffee[31m');
  });

  it('truncates to the maximum length', () => {
    expect(sanitizeText('x'.repeat(500)).length).toBe(200);
  });

  /**
   * Sanitisation is NOT the XSS defence - React escapes at render time. What this
   * test pins down is that the text survives intact: escaping here as well would
   * corrupt the stored description.
   */
  it('leaves markup untouched, because escaping belongs to rendering', () => {
    expect(sanitizeText('<b>Rent</b>')).toBe('<b>Rent</b>');
  });
});

describe('shared schemas', () => {
  it('normalises the email to lowercase on signup', () => {
    const result = signupSchema.safeParse({ email: '  USER@Example.COM ', password: 'longenough1' });
    expect(result.success && result.data.email).toBe('user@example.com');
  });

  it('reports one message per field for the form to display', () => {
    const result = parseOrFieldErrors(signupSchema, { email: 'nope', password: 'short' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.fields).sort()).toEqual(['email', 'password']);
    }
  });

  it('rejects a date that is not YYYY-MM-DD', () => {
    const base = { amountCents: 100, description: 'x', categoryId: 'a'.repeat(24) };
    expect(createExpenseSchema.safeParse({ ...base, date: '2026-9-1' }).success).toBe(false);
    expect(createExpenseSchema.safeParse({ ...base, date: '2026-09-01' }).success).toBe(true);
  });

  it('rejects a zero or fractional amount', () => {
    const base = { description: 'x', categoryId: 'a'.repeat(24), date: '2026-09-01' };
    expect(createExpenseSchema.safeParse({ ...base, amountCents: 0 }).success).toBe(false);
    expect(createExpenseSchema.safeParse({ ...base, amountCents: 10.5 }).success).toBe(false);
  });

  it('caps the list limit so a query cannot ask for everything', () => {
    expect(listExpensesQuerySchema.safeParse({ limit: '5000' }).success).toBe(false);
    expect(listExpensesQuerySchema.parse({}).limit).toBe(100);
  });
});
