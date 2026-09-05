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

const apiError = (status: number) => new ApiError({ message: `boom ${status}`, status });

/**
 * The provider memoises both its config and its client at module scope, so each
 * test needs a genuinely fresh module graph rather than a reset mock.
 */
async function loadProvider(model: string) {
  vi.resetModules();
  process.env['GEMINI_API_KEY'] = 'test-key';
  process.env['GEMINI_MODEL'] = model;
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

describe('reading a receipt with Gemini', () => {
  it('reads the document and stops', async () => {
    const { readReceiptWithGemini } = await loadProvider('primary');

    const outcome = await readReceiptWithGemini(FILE, CATEGORIES);

    expect(outcome).toMatchObject({ status: 'ok' });
    expect(calls).toEqual(['primary']);
  });

  /**
   * A 429 or 5xx is congestion, and congestion is worth riding out once before
   * spending a whole second vendor on it.
   */
  it('retries a congested model once, and takes the answer', async () => {
    generateContent.mockRejectedValueOnce(apiError(503)).mockImplementationOnce(() => {
      calls.push('primary');
      return Promise.resolve({ text: GOOD_JSON });
    });
    const { readReceiptWithGemini } = await loadProvider('primary');

    await expect(readReceiptWithGemini(FILE, CATEGORIES)).resolves.toMatchObject({ status: 'ok' });
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it('reports unavailable, not unreadable, once the retry is spent', async () => {
    generateContent.mockRejectedValue(apiError(503));
    const { readReceiptWithGemini } = await loadProvider('primary');

    await expect(readReceiptWithGemini(FILE, CATEGORIES)).resolves.toEqual({
      status: 'unavailable',
    });
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  /**
   * The regression this file exists for.
   *
   * A retired model name answers 404, and 404 is not congestion - so an earlier
   * version classified it as `unreadable` and the app told the user to take a
   * clearer photo of a perfectly good receipt. A request that THREW never got as
   * far as looking at the document, whatever the status code, so it can never be
   * the document's fault. These are also not retried: the second attempt would
   * fail identically.
   */
  it('never blames the document for an error the document was not involved in', async () => {
    for (const status of [400, 401, 403, 404]) {
      generateContent.mockReset();
      generateContent.mockRejectedValue(apiError(status));
      const { readReceiptWithGemini } = await loadProvider('retired-model');

      await expect(readReceiptWithGemini(FILE, CATEGORIES)).resolves.toEqual({
        status: 'unavailable',
      });
      expect(generateContent).toHaveBeenCalledTimes(1);
    }
  });

  /**
   * A model that looked at the document and found nothing has given a real
   * answer. Asking the same model again will not change it, so the retry loop
   * stops - and `unreadable` is what escalates to the other vendor's different
   * eyes, handled one describe down.
   */
  it('does not re-ask a model that already read the document and gave up', async () => {
    generateContent.mockResolvedValue({ text: 'no receipt here' });
    const { readReceiptWithGemini } = await loadProvider('primary');

    await expect(readReceiptWithGemini(FILE, CATEGORIES)).resolves.toEqual({
      status: 'unreadable',
    });
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('gives up promptly when the caller has already abandoned the request', async () => {
    generateContent.mockRejectedValue(apiError(503));
    const { readReceiptWithGemini } = await loadProvider('primary');

    const outcome = await readReceiptWithGemini(FILE, CATEGORIES, { signal: AbortSignal.abort() });

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
   * Gemini looked at the document and found no expense in it. That is an answer
   * ABOUT the document rather than about Google's availability, so a second
   * opinion is latency the user pays for nothing.
   */
  it('does not spend a second vendor on a document already judged unreadable', async () => {
    generateContent.mockResolvedValue({ text: 'no receipt here' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { readReceipt } = await loadChain({
      GEMINI_API_KEY: 'test-key',
      GEMINI_MODEL: 'primary',
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
      OPENROUTER_API_KEY: undefined,
    });

    await expect(readReceipt(FILE, CATEGORIES)).resolves.toEqual({ status: 'unavailable' });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
