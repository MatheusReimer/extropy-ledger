import { describe, expect, it } from 'vitest';
import { setBudgetSchema } from '@expense/shared';

describe('setBudgetSchema', () => {
  it('accepts a whole number of minor units', () => {
    expect(setBudgetSchema.parse({ limitCents: 20_000 })).toEqual({ limitCents: 20_000 });
  });

  /**
   * Zero is a real budget, not an absent one.
   *
   * "Spend nothing on this category" is a thing a person means, which is why an
   * unset budget is the ROW not existing rather than a zero in it. If zero were
   * rejected here, the two states would have to share one value and the UI could
   * never tell "no limit" from "limit of nothing".
   */
  it('accepts zero, which means spend nothing here', () => {
    expect(setBudgetSchema.parse({ limitCents: 0 })).toEqual({ limitCents: 0 });
  });

  it('rejects a negative limit', () => {
    expect(setBudgetSchema.safeParse({ limitCents: -1 }).success).toBe(false);
  });

  it('rejects fractional minor units, which are not money', () => {
    expect(setBudgetSchema.safeParse({ limitCents: 12.5 }).success).toBe(false);
  });

  it('rejects a string that merely looks like a number', () => {
    expect(setBudgetSchema.safeParse({ limitCents: '20000' }).success).toBe(false);
  });

  it('rejects a missing limit rather than defaulting it to zero', () => {
    // Defaulting would silently set "spend nothing" on a malformed request.
    expect(setBudgetSchema.safeParse({}).success).toBe(false);
  });
});
