import { describeError, logger } from '../../lib/logger.js';
import { askGemini, readReceiptWithGemini } from './gemini.js';
import { askGroq } from './groq.js';
import { readReceiptWithOpenRouter } from './openrouter.js';
import type { AskModel, Provider, ReadReceipt } from './types.js';

export type { AskModel, AskOptions, Provider, CategorizeInput, ReadReceipt, ReceiptFile } from './types.js';

/**
 * How long Gemini may hold the receipt budget before the second vendor is tried.
 *
 * Above the hedged path's measured worst case (10.7s) and well under the route's
 * 25s ceiling, so there is always a usable remainder for the fallback.
 */
const GEMINI_SLICE_MS = 15_000;

export type ChainBudget = {
  /** Ceiling for the whole chain, however many providers it holds. */
  readonly totalMs: number;
  /** Ceiling for any single attempt, so a stalled provider cannot eat the rest. */
  readonly perProviderMs: number;
};

/**
 * Two limits, and the second one took a live test to discover.
 *
 * A single shared deadline looked correct and was not: when Gemini stalled it
 * consumed all eight seconds, the chain logged `budgetExpired: true`, and Groq
 * was never called at all. A fallback the primary can starve is not a fallback.
 * Each attempt now gets its own slice, bounded by whatever remains of the total,
 * so a hung provider costs its slice and nothing more.
 *
 * Eight seconds total is the ceiling on what a form suggestion is worth waiting
 * for; four per provider leaves room for two real attempts inside it.
 */
const DEFAULT_BUDGET: ChainBudget = { totalMs: 8_000, perProviderMs: 4_000 };

/**
 * Tried in order, first usable answer wins.
 *
 * A provider with no key configured returns `undefined` immediately and costs
 * nothing, so this list is correct whether one key is set or both.
 */
const PROVIDERS: readonly Provider[] = [
  { name: 'gemini', ask: askGemini },
  { name: 'groq', ask: askGroq },
];

/**
 * Sequential, not parallel.
 *
 * Racing both would shave the tail latency, but it would also spend two
 * free-tier quotas on every categorisation to save time on the minority of calls
 * that fail. The second provider is insurance, and insurance you claim on every
 * trip is just a bill.
 */
export function firstAnswerFrom(
  providers: readonly Provider[] = PROVIDERS,
  budget: ChainBudget = DEFAULT_BUDGET,
): AskModel {
  return async (input, allowedCategories) => {
    const deadline = Date.now() + budget.totalMs;

    for (const provider of providers) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        logger.warn('ai chain budget spent', { skipped: provider.name });
        break;
      }

      // The slice is the smaller of this provider's allowance and whatever is
      // left of the chain's total.
      const signal = AbortSignal.timeout(Math.min(budget.perProviderMs, remaining));

      // The contract says a provider never throws. Enforcing it here anyway is
      // the difference between one broken provider degrading the chain and one
      // broken provider taking down every provider after it.
      try {
        const answer = await provider.ask(input, allowedCategories, { signal });
        if (answer) return answer;
      } catch (error) {
        logger.error('ai provider threw', { provider: provider.name, ...describeError(error) });
      }
    }

    // Individual reasons are already logged by each provider; this line is what
    // makes "the whole chain is down" visible as its own event.
    logger.warn('ai all providers declined', {
      tried: providers.map((provider) => provider.name).join(','),
    });
    return undefined;
  };
}

/** The composed provider chain used by the route. */
export const askModel: AskModel = firstAnswerFrom();

/**
 * Reading a receipt: two Gemini models hedged against each other, then a
 * different vendor entirely.
 *
 * Groq cannot appear here - its models are text-only - which is why this is a
 * short bespoke chain rather than the `firstAnswerFrom` cascade above. The two
 * rungs answer different failures, and it is worth being precise about which:
 *
 * - **Gemini, hedged** handles a congested or slow MODEL, which measurement says
 *   is overwhelmingly the common case.
 * - **OpenRouter** handles everything that takes all of Google out at once: a
 *   revoked key, an exhausted daily quota, an outage. Hedging two models of the
 *   same vendor is no defence against any of those.
 *
 * Optional, like every other key: with no `OPENROUTER_API_KEY` this rung reports
 * `unavailable` immediately and the behaviour is exactly what it was before.
 *
 * `unreadable` deliberately does NOT fall through. If Gemini looked at the
 * document and both of its models agreed there was no expense in it, that is an
 * answer about the document, and asking a third model is latency spent to be
 * told the same thing.
 */
export const readReceipt: ReadReceipt = async (file, allowedCategories, options) => {
  /**
   * Gemini gets a SLICE of the budget, not all of it.
   *
   * Caught by a live test, and it is the same lesson as the categorisation chain
   * above, one level up: sharing one deadline let a slow-but-healthy Gemini
   * spend the whole 25 seconds, after which the signal was already aborted and
   * the second vendor was never asked. The reader reported "unavailable" while
   * a working fallback sat there untouched.
   *
   * Fifteen seconds is comfortably above the hedged Gemini path's measured
   * worst case of 10.7s, so this costs nothing in the normal case and only bites
   * when Gemini is failing slowly - which is precisely when the fallback matters.
   */
  const geminiSignal = options?.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(GEMINI_SLICE_MS)])
    : AbortSignal.timeout(GEMINI_SLICE_MS);

  const primary = await readReceiptWithGemini(file, allowedCategories, {
    ...options,
    signal: geminiSignal,
  });
  if (primary.status !== 'unavailable') return primary;

  // The OUTER signal, deliberately: whatever is left of the total is the
  // fallback's to use, and only a caller who has genuinely given up stops it.
  if (options?.signal?.aborted) return primary;

  const fallback = await readReceiptWithOpenRouter(file, allowedCategories, options);
  if (fallback.status === 'ok') {
    logger.info('ai receipt recovered', { provider: 'openrouter' });
  }
  return fallback;
};
