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

/**
 * The chain the route actually calls: Gemini first, a different vendor behind it.
 *
 * Tested through the composed export rather than the provider in isolation,
 * because the thing worth pinning down is the HANDOFF - which failures fall
 * through to the second vendor and which stop at the first.
 */
describe('the receipt provider chain', () => {
  const okBody = {
    choices: [{ message: { content: GOOD_JSON } }],
    usage: { prompt_tokens: 10, completion_tokens: 20 },
  };

  async function loadChain(env: Record<string, string | undefined>) {
    vi.resetModules();
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    return import('../src/ai/providers/index.js');
  }

  it('never calls the second vendor when Gemini reads the document', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { readReceipt } = await loadChain({
      GEMINI_API_KEY: 'test-key',
      GEMINI_MODEL: 'primary',
      GEMINI_FALLBACK_MODEL: 'fallback',
      OPENROUTER_API_KEY: 'or-key',
    });

    const outcome = await readReceipt(FILE, CATEGORIES);

    expect(outcome).toMatchObject({ status: 'ok' });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('falls through to the second vendor when Google is unreachable', async () => {
    generateContent.mockRejectedValue(apiError(503));
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(okBody), { status: 200 }));
    const { readReceipt } = await loadChain({
      GEMINI_API_KEY: 'test-key',
      GEMINI_MODEL: 'primary',
      GEMINI_FALLBACK_MODEL: 'fallback',
      OPENROUTER_API_KEY: 'or-key',
    });

    const outcome = await readReceipt(FILE, CATEGORIES);

    expect(outcome).toMatchObject({ status: 'ok' });
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain('openrouter.ai');
    fetchSpy.mockRestore();
  });

  /**
   * The distinction that keeps the second vendor from being wasted latency.
   * Two Gemini models looked at the document and agreed it holds no expense;
   * that is an answer ABOUT the document, and a third opinion cannot change it.
   */
  it('does not spend a second vendor on a document already judged unreadable', async () => {
    generateContent.mockResolvedValue({ text: 'no receipt here' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { readReceipt } = await loadChain({
      GEMINI_API_KEY: 'test-key',
      GEMINI_MODEL: 'primary',
      GEMINI_FALLBACK_MODEL: 'fallback',
      OPENROUTER_API_KEY: 'or-key',
    });

    await expect(readReceipt(FILE, CATEGORIES)).resolves.toEqual({ status: 'unreadable' });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  /**
   * The regression this section exists for.
   *
   * Caught by a live run, not by reasoning: with a shared deadline, a
   * slow-but-healthy Gemini spent the entire 25s budget, the signal aborted, and
   * the second vendor was never asked - the reader reported "unavailable" while
   * a working fallback sat untouched. Gemini now gets a slice, not the lot.
   */
  it('does not let a slow Gemini spend the whole budget and starve the fallback', async () => {
    // Hangs until aborted, which is how the real SDK behaves on a stalled call:
    // a mock that ignored the signal would hang the test rather than the budget.
    generateContent.mockImplementation(({ config }: { config?: { abortSignal?: AbortSignal } }) => {
      return new Promise((_resolve, reject) => {
        config?.abortSignal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }));
        });
      });
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(okBody), { status: 200 }));
    const { readReceipt } = await loadChain({
      GEMINI_API_KEY: 'test-key',
      GEMINI_MODEL: 'primary',
      GEMINI_FALLBACK_MODEL: 'fallback',
      OPENROUTER_API_KEY: 'or-key',
    });

    const outcome = await readReceipt(FILE, CATEGORIES, {
      signal: AbortSignal.timeout(25_000),
    });

    expect(outcome).toMatchObject({ status: 'ok' });
    expect(fetchSpy).toHaveBeenCalledOnce();
    fetchSpy.mockRestore();
  }, 40_000);

  it('behaves exactly as before when no second-vendor key is configured', async () => {
    generateContent.mockRejectedValue(apiError(503));
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { readReceipt } = await loadChain({
      GEMINI_API_KEY: 'test-key',
      GEMINI_MODEL: 'primary',
      GEMINI_FALLBACK_MODEL: 'fallback',
      OPENROUTER_API_KEY: undefined,
    });

    await expect(readReceipt(FILE, CATEGORIES)).resolves.toEqual({ status: 'unavailable' });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
