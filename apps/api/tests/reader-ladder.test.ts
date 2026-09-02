import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@google/genai';
import type * as GenAI from '@google/genai';
import { PREDEFINED_CATEGORIES } from '@expense/shared';

const CATEGORIES = [...PREDEFINED_CATEGORIES];
const FILE = { bytes: Buffer.from([0xff, 0xd8, 0xff, 0xe0]), mimeType: 'image/jpeg' as const };

/** What a well-behaved model hands back for the sample receipt. */
const GOOD_JSON = JSON.stringify({
  merchant: 'HARBOR & PINE',
  description: 'Lunch',
  amountCents: 12_376,
  currency: 'USD',
  date: '2026-08-14',
  category: 'Dining',
  confidence: 0.95,
});

/** Every call the provider makes, in order, so the ladder itself is observable. */
const calls: string[] = [];
const generateContent = vi.fn();

vi.mock('@google/genai', async (importOriginal) => {
  const actual = await importOriginal<typeof GenAI>();
  return {
    ...actual,
    GoogleGenAI: class {
      models = { generateContent };
    },
  };
});

const apiError = (status: number) =>
  new ApiError({ message: `boom ${status}`, status });

/**
 * The provider memoises both its config and its client at module scope, so each
 * test needs a genuinely fresh module graph rather than a reset mock.
 */
async function loadProvider(model: string, fallback: string) {
  vi.resetModules();
  process.env['GEMINI_API_KEY'] = 'test-key';
  process.env['GEMINI_MODEL'] = model;
  process.env['GEMINI_FALLBACK_MODEL'] = fallback;
  return import('../src/ai/providers/gemini.js');
}

beforeEach(() => {
  calls.length = 0;
  generateContent.mockReset();
  generateContent.mockImplementation(({ model }: { model: string }) => {
    calls.push(model);
    return Promise.resolve({ text: GOOD_JSON });
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('the receipt reader ladder', () => {
  it('stops at the first rung when the model answers', async () => {
    const { readReceiptWithGemini } = await loadProvider('primary', 'fallback');

    const outcome = await readReceiptWithGemini(FILE, CATEGORIES);

    expect(outcome).toMatchObject({ status: 'ok' });
    expect(calls).toEqual(['primary']);
  });

  /**
   * The whole point of a second MODEL rather than a second provider: Google
   * pools capacity per model, so a congested primary is not a congested account.
   */
  it('reaches the fallback model when the primary keeps failing', async () => {
    generateContent
      .mockRejectedValueOnce(apiError(503))
      .mockRejectedValueOnce(apiError(429))
      .mockImplementationOnce(({ model }: { model: string }) => {
        calls.push(model);
        return Promise.resolve({ text: GOOD_JSON });
      });
    const { readReceiptWithGemini } = await loadProvider('primary', 'fallback');

    const outcome = await readReceiptWithGemini(FILE, CATEGORIES);

    expect(outcome).toMatchObject({ status: 'ok' });
    expect(calls).toEqual(['fallback']);
  });

  it('reports unavailable, not unreadable, once every rung is spent', async () => {
    generateContent.mockRejectedValue(apiError(503));
    const { readReceiptWithGemini } = await loadProvider('primary', 'fallback');

    await expect(readReceiptWithGemini(FILE, CATEGORIES)).resolves.toEqual({
      status: 'unavailable',
    });
    // Two models, two attempts each: congestion is worth riding out per model.
    expect(generateContent).toHaveBeenCalledTimes(4);
  });

  /**
   * The regression this file exists for.
   *
   * A retired model name answers 404, and 404 is not congestion - so an earlier
   * version classified it as `unreadable` and the app told the user to take a
   * clearer photo of a perfectly good receipt. A request that THREW never got as
   * far as looking at the document, whatever the status code, so it can never be
   * the document's fault.
   */
  it('never blames the document for an error the document was not involved in', async () => {
    for (const status of [400, 401, 403, 404]) {
      generateContent.mockRejectedValue(apiError(status));
      const { readReceiptWithGemini } = await loadProvider('retired-model', 'also-retired');

      await expect(readReceiptWithGemini(FILE, CATEGORIES)).resolves.toEqual({
        status: 'unavailable',
      });
    }
  });

  /**
   * A second opinion on a marginal document.
   *
   * This is the hole the first version of the ladder had: it stopped dead on
   * `unreadable`, on the reasoning that re-reading a rejected document buys
   * nothing. True of the SAME model - but a different model has different vision,
   * and the rung that could actually help was the one being skipped.
   */
  it('asks a different model when the first one finds nothing', async () => {
    generateContent
      .mockResolvedValueOnce({ text: 'I could not find a receipt here.' })
      .mockImplementationOnce(({ model }: { model: string }) => {
        calls.push(model);
        return Promise.resolve({ text: GOOD_JSON });
      });
    const { readReceiptWithGemini } = await loadProvider('primary', 'fallback');

    const outcome = await readReceiptWithGemini(FILE, CATEGORIES);

    expect(outcome).toMatchObject({ status: 'ok' });
    expect(calls).toEqual(['fallback']);
  });

  /** But it does not ask the SAME model twice - that answer will not change. */
  it('does not re-ask a model that already read the document and gave up', async () => {
    generateContent.mockResolvedValue({ text: 'no receipt here' });
    const { readReceiptWithGemini } = await loadProvider('primary', 'fallback');

    await expect(readReceiptWithGemini(FILE, CATEGORIES)).resolves.toEqual({
      status: 'unreadable',
    });
    // Once per model, not twice: two calls, not four.
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  /**
   * "Your receipt is illegible" is a claim, and it needs every model to have
   * actually looked. One giving up while another was never reached does not
   * support it - the unreached model might have read it perfectly well.
   */
  it('will not call a document unreadable when a model was never reached', async () => {
    generateContent
      .mockResolvedValueOnce({ text: 'no receipt here' })
      .mockRejectedValue(apiError(503));
    const { readReceiptWithGemini } = await loadProvider('primary', 'fallback');

    await expect(readReceiptWithGemini(FILE, CATEGORIES)).resolves.toEqual({
      status: 'unavailable',
    });
  });

  /** A misconfiguration that points both names at one model must not halve the ladder. */
  it('does not collapse when both model names are the same', async () => {
    generateContent.mockResolvedValue({ text: 'no receipt here' });
    const { readReceiptWithGemini } = await loadProvider('same', 'same');

    await expect(readReceiptWithGemini(FILE, CATEGORIES)).resolves.toEqual({
      status: 'unreadable',
    });
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  /**
   * The failure a user actually reported, reproduced.
   *
   * Measured against the live API, one read in ten took 27.4s against a 25s
   * budget while the median was under four. Run strictly in sequence, that one
   * slow call consumed the entire allowance and the fallback was never asked -
   * so a working model and a legible receipt still produced "the reader is
   * busy". Hedging starts the fallback alongside a slow primary instead.
   */
  it('does not let a slow primary starve the fallback', async () => {
    generateContent.mockImplementation(({ model }: { model: string }) => {
      calls.push(model);
      // Far longer than the hedge delay, and longer than any real budget.
      if (model === 'slowpoke') return new Promise(() => {});
      return Promise.resolve({ text: GOOD_JSON });
    });
    const { readReceiptWithGemini } = await loadProvider('slowpoke', 'fallback');

    const started = Date.now();
    const outcome = await readReceiptWithGemini(FILE, CATEGORIES);
    const elapsed = Date.now() - started;

    expect(outcome).toMatchObject({ status: 'ok' });
    // The fallback answered while the primary was still hanging.
    expect(calls).toContain('fallback');
    // And it did not wait out the primary, which never resolves at all.
    expect(elapsed).toBeLessThan(12_000);
  }, 20_000);

  it('gives up promptly when the caller has already abandoned the request', async () => {
    generateContent.mockRejectedValue(apiError(503));
    const { readReceiptWithGemini } = await loadProvider('primary', 'fallback');

    const outcome = await readReceiptWithGemini(FILE, CATEGORIES, {
      signal: AbortSignal.abort(),
    });

    expect(outcome).toEqual({ status: 'unavailable' });
    expect(generateContent).not.toHaveBeenCalled();
  });
});
