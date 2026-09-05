import { describeError, logger } from '../../lib/logger.js';
import { askGemini, readReceiptWithGemini } from './gemini.js';
import { askOpenRouter, readReceiptWithOpenRouter } from './openrouter.js';
import type { AskModel, Provider, ReadReceipt } from './types.js';

export type {
  AskModel,
  AskOptions,
  Provider,
  CategorizeInput,
  ReadReceipt,
  ReceiptFile,
} from './types.js';

const GEMINI_SLICE_MS = 15_000;

export type ChainBudget = {
  readonly totalMs: number;
  readonly perProviderMs: number;
};

const DEFAULT_BUDGET: ChainBudget = { totalMs: 8_000, perProviderMs: 4_000 };

const PROVIDERS: readonly Provider[] = [
  { name: 'gemini', ask: askGemini },
  { name: 'openrouter', ask: askOpenRouter },
];

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

      const signal = AbortSignal.timeout(Math.min(budget.perProviderMs, remaining));

      try {
        const answer = await provider.ask(input, allowedCategories, { signal });
        if (answer) return answer;
      } catch (error) {
        logger.error('ai provider threw', { provider: provider.name, ...describeError(error) });
      }
    }

    logger.warn('ai all providers declined', {
      tried: providers.map((provider) => provider.name).join(','),
    });
    return undefined;
  };
}

export const askModel: AskModel = firstAnswerFrom();

export const readReceipt: ReadReceipt = async (file, allowedCategories, options) => {
  const geminiSignal = options?.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(GEMINI_SLICE_MS)])
    : AbortSignal.timeout(GEMINI_SLICE_MS);

  const primary = await readReceiptWithGemini(file, allowedCategories, {
    ...options,
    signal: geminiSignal,
  });
  if (primary.status !== 'unavailable') return primary;

  if (options?.signal?.aborted) return primary;

  const fallback = await readReceiptWithOpenRouter(file, allowedCategories, options);
  if (fallback.status === 'ok') {
    logger.info('ai receipt recovered', { provider: 'openrouter' });
  }
  return fallback;
};
