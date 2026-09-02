import { describeError, logger } from '../../lib/logger.js';
import { askGemini, readReceiptWithGemini } from './gemini.js';
import { askGroq } from './groq.js';
import type { AskModel, Provider, ReadReceipt } from './types.js';

export type { AskModel, AskOptions, Provider, CategorizeInput, ReadReceipt, ReceiptFile } from './types.js';

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
 * Receipt reading has one provider, and that is a fact about the providers
 * rather than a shortcut.
 *
 * Groq's models are text-only, so there is no second opinion available for a
 * photograph. The failure mode is mild - no draft, type it manually - which is
 * why this is acceptable where it would not be for the categorisation path.
 */
export const readReceipt: ReadReceipt = readReceiptWithGemini;
