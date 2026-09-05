import { describe, expect, it, vi } from 'vitest';
import { PREDEFINED_CATEGORIES } from '@expense/shared';
import { categorize } from '../src/ai/categorize.js';
import { parseModelCategory, parseModelResponse } from '../src/ai/parse.js';
import { firstAnswerFrom } from '../src/ai/providers/index.js';
import type { Provider } from '../src/ai/providers/types.js';

const CATEGORIES = [...PREDEFINED_CATEGORIES];

describe('parseModelCategory', () => {
  it('canonicalises casing to the allowed spelling', () => {
    expect(parseModelCategory({ category: 'dining', confidence: 0.8 }, CATEGORIES)).toEqual({
      category: 'Dining',
      confidence: 0.8,
    });
  });

  it('rejects a category outside the allowed list', () => {
    expect(parseModelCategory({ category: 'Crypto', confidence: 0.9 }, CATEGORIES)).toBeUndefined();
  });

  it('rejects a non-object payload', () => {
    expect(parseModelCategory('Dining', CATEGORIES)).toBeUndefined();
  });

  it('clamps a confidence outside 0..1 instead of trusting it', () => {
    expect(parseModelCategory({ category: 'Dining', confidence: 7 }, CATEGORIES)?.confidence).toBe(
      1,
    );
    expect(parseModelCategory({ category: 'Dining', confidence: -2 }, CATEGORIES)?.confidence).toBe(
      0,
    );
  });

  it('defaults a missing confidence rather than dropping a valid category', () => {
    expect(parseModelCategory({ category: 'Dining' }, CATEGORIES)?.confidence).toBe(0.5);
  });
});

/**
 * Constrained decoding makes these unlikely, not impossible - and this route's
 * whole promise is that it degrades instead of failing. A throw anywhere in here
 * would surface as a 500.
 */
describe('parseModelResponse', () => {
  it('parses a well-formed schema response', () => {
    const text = JSON.stringify({ category: 'Travel', confidence: 0.4 });
    expect(parseModelResponse(text, CATEGORIES)).toEqual({ category: 'Travel', confidence: 0.4 });
  });

  it('returns undefined for a response truncated at the token limit', () => {
    expect(parseModelResponse('{"category":"Tra', CATEGORIES)).toBeUndefined();
  });

  it('returns undefined for prose instead of JSON', () => {
    expect(parseModelResponse('Sure! That looks like Dining.', CATEGORIES)).toBeUndefined();
  });

  it('returns undefined for an empty or missing response', () => {
    expect(parseModelResponse('', CATEGORIES)).toBeUndefined();
    expect(parseModelResponse(undefined, CATEGORIES)).toBeUndefined();
  });

  it('still refuses an off-list category that arrived as valid JSON', () => {
    expect(parseModelResponse('{"category":"Crypto","confidence":1}', CATEGORIES)).toBeUndefined();
  });
});

describe('categorize', () => {
  it('asks the model and reports the answer as its own', async () => {
    const askModel = vi.fn().mockResolvedValue({ category: 'Housing', confidence: 0.7 });
    const result = await categorize(
      { description: 'Quarterly payment to Vandelay Industries' },
      CATEGORIES,
      { askModel },
    );

    expect(askModel).toHaveBeenCalledOnce();
    expect(result).toEqual({ category: 'Housing', confidence: 0.7, source: 'model' });
  });

  it('falls back gracefully when the model is unavailable', async () => {
    const askModel = vi.fn().mockResolvedValue(undefined);
    const result = await categorize({ description: 'Zorblatt Industries' }, CATEGORIES, {
      askModel,
    });

    expect(result).toEqual({ category: 'Other', confidence: 0, source: 'fallback' });
  });

  it('retries the model after a fallback, rather than settling on it', async () => {
    const askModel = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ category: 'Travel', confidence: 0.6 });

    const first = await categorize({ description: 'Zorblatt Industries' }, CATEGORIES, {
      askModel,
    });
    const second = await categorize({ description: 'Zorblatt Industries' }, CATEGORIES, {
      askModel,
    });

    expect(first.source).toBe('fallback');
    expect(second).toEqual({ category: 'Travel', confidence: 0.6, source: 'model' });
    expect(askModel).toHaveBeenCalledTimes(2);
  });

  it('never suggests a category the user does not have', async () => {
    const askModel = vi.fn().mockResolvedValue({ category: 'Dining', confidence: 0.9 });
    const limited = ['Food', 'Other'];

    // The model says "Dining", but this user does not have that category, so
    // the only valid answer is the fallback. A suggestion the user cannot
    // accept is worse than no suggestion.
    const result = await categorize({ description: 'Starbucks' }, limited, { askModel });
    expect(limited).toContain(result.category);
    expect(result).toEqual({ category: 'Other', confidence: 0, source: 'fallback' });
  });
});

/**
 * The provider chain exists because free tiers fail: measured against Gemini's,
 * roughly a third of calls came back 503 or 504 under load. A retry on the same
 * provider queues behind the same congestion; a second provider does not.
 */
describe('firstAnswerFrom', () => {
  const provider = (name: string, ask: Provider['ask']): Provider => ({ name, ask });

  it('returns the first answer and never calls the rest', async () => {
    const second = vi.fn();
    const ask = firstAnswerFrom([
      provider('first', async () => ({ category: 'Dining', confidence: 0.7 })),
      provider('second', second),
    ]);

    await expect(ask({ description: 'x' }, CATEGORIES)).resolves.toEqual({
      category: 'Dining',
      confidence: 0.7,
    });
    expect(second).not.toHaveBeenCalled();
  });

  it('falls through to the next provider when one declines', async () => {
    const ask = firstAnswerFrom([
      provider('first', async () => undefined),
      provider('second', async () => ({ category: 'Travel', confidence: 0.5 })),
    ]);

    await expect(ask({ description: 'x' }, CATEGORIES)).resolves.toEqual({
      category: 'Travel',
      confidence: 0.5,
    });
  });

  it('keeps going when a provider breaks its contract and throws', async () => {
    const ask = firstAnswerFrom([
      provider('broken', async () => {
        throw new Error('boom');
      }),
      provider('healthy', async () => ({ category: 'Health', confidence: 0.9 })),
    ]);

    await expect(ask({ description: 'x' }, CATEGORIES)).resolves.toEqual({
      category: 'Health',
      confidence: 0.9,
    });
  });

  /**
   * The bug this pins down was found live, not in review: with a single shared
   * deadline, a stalled Gemini consumed the entire chain budget and the second
   * provider was never called. A fallback the primary can starve is not one.
   */
  it('does not let a stalled provider starve the next one', async () => {
    const slow: Provider = {
      name: 'stalls',
      ask: (_input, _categories, options) =>
        new Promise((resolve) => {
          // Resolves only when its own slice is aborted - never on its own.
          options?.signal?.addEventListener('abort', () => resolve(undefined));
        }),
    };
    const fast = provider('fast', async () => ({ category: 'Travel', confidence: 0.6 }));

    const ask = firstAnswerFrom([slow, fast], { totalMs: 200, perProviderMs: 50 });
    await expect(ask({ description: 'x' }, CATEGORIES)).resolves.toEqual({
      category: 'Travel',
      confidence: 0.6,
    });
  });

  it('stops once the total budget is spent rather than running the whole list', async () => {
    const stall = (name: string): Provider => ({
      name,
      ask: (_input, _categories, options) =>
        new Promise((resolve) =>
          options?.signal?.addEventListener('abort', () => resolve(undefined)),
        ),
    });
    const never = vi.fn();

    // Two 40ms slices exhaust an 80ms total, so the third is never reached.
    const ask = firstAnswerFrom([stall('a'), stall('b'), provider('c', never)], {
      totalMs: 80,
      perProviderMs: 40,
    });

    await expect(ask({ description: 'x' }, CATEGORIES)).resolves.toBeUndefined();
    expect(never).not.toHaveBeenCalled();
  });

  it('returns undefined when every provider declines, so the cascade falls back', async () => {
    const ask = firstAnswerFrom([
      provider('first', async () => undefined),
      provider('second', async () => undefined),
    ]);

    await expect(ask({ description: 'x' }, CATEGORIES)).resolves.toBeUndefined();
  });

  it('is a no-op when no providers are configured at all', async () => {
    await expect(firstAnswerFrom([])({ description: 'x' }, CATEGORIES)).resolves.toBeUndefined();
  });
});
