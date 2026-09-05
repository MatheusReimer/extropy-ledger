import { ApiError, GoogleGenAI, ThinkingLevel } from '@google/genai';
import { getConfig } from '../../config.js';
import { logger, describeError } from '../../lib/logger.js';
import { buildSystemPrompt, buildUserPrompt } from '../prompt.js';
import { geminiResponseSchema } from '../schema.js';
import { parseModelResponse } from '../parse.js';
import { buildReceiptSystemPrompt, geminiReceiptSchema } from '../receipt-schema.js';
import { parseExtractedExpense } from '../receipt-parse.js';
import type { AskModel, ReadOutcome, ReadReceipt, ReceiptFile } from './types.js';

const MAX_OUTPUT_TOKENS = 512;

let client: GoogleGenAI | undefined;

export const askGemini: AskModel = async (input, allowedCategories, options) => {
  const config = getConfig();
  if (!config.GEMINI_API_KEY) return undefined;

  client ??= new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });

  try {
    const response = await client.models.generateContent({
      model: config.GEMINI_MODEL,
      contents: buildUserPrompt(input),
      config: {
        systemInstruction: buildSystemPrompt(allowedCategories),
        responseMimeType: 'application/json',
        responseSchema: geminiResponseSchema(allowedCategories),
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        temperature: 0,
        ...(options?.signal ? { abortSignal: options.signal } : {}),
      },
    });

    const parsed = parseModelResponse(response.text, allowedCategories);
    logger.info('ai provider answered', {
      provider: 'gemini',
      model: config.GEMINI_MODEL,
      matched: Boolean(parsed),
      inputTokens: response.usageMetadata?.promptTokenCount,
      outputTokens: response.usageMetadata?.candidatesTokenCount,
    });
    return parsed;
  } catch (error) {
    if (error instanceof ApiError) {
      const routine = error.status === 429 || error.status >= 500;
      logger[routine ? 'warn' : 'error']('ai provider failed', {
        provider: 'gemini',
        status: error.status,
        message: error.message.slice(0, 200),
      });
    } else {
      logger.warn('ai provider failed', { provider: 'gemini', ...describeError(error) });
    }
    return undefined;
  }
};

const RECEIPT_MAX_OUTPUT_TOKENS = 1_024;

const RETRY_DELAY_MS = 700;

const ATTEMPTS_PER_MODEL = 2;

const HEDGE_AFTER_MS = 6_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isTransient = (error: unknown): boolean =>
  error instanceof ApiError && (error.status === 429 || error.status >= 500);

type Attempt = { outcome: ReadOutcome; retrySameModel: boolean };

async function readOnce(
  model: string,
  file: ReceiptFile,
  allowedCategories: readonly string[],
  apiKey: string,
  signal: AbortSignal | undefined,
): Promise<Attempt> {
  client ??= new GoogleGenAI({ apiKey });

  try {
    const response = await client.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: file.mimeType, data: file.bytes.toString('base64') } },
            { text: 'Extract the expense from this receipt or invoice.' },
          ],
        },
      ],
      config: {
        systemInstruction: buildReceiptSystemPrompt(allowedCategories),
        responseMimeType: 'application/json',
        responseSchema: geminiReceiptSchema(allowedCategories),
        maxOutputTokens: RECEIPT_MAX_OUTPUT_TOKENS,
        temperature: 0,
        ...(signal ? { abortSignal: signal } : {}),
      },
    });

    const parsed = (() => {
      try {
        return response.text
          ? parseExtractedExpense(JSON.parse(response.text), allowedCategories)
          : undefined;
      } catch {
        return undefined;
      }
    })();

    logger.info('ai receipt read', {
      provider: 'gemini',
      model,
      mimeType: file.mimeType,
      bytes: file.bytes.length,
      matched: Boolean(parsed),
      confidence: parsed?.confidence,
      inputTokens: response.usageMetadata?.promptTokenCount,
      outputTokens: response.usageMetadata?.candidatesTokenCount,
    });

    return {
      outcome: parsed ? { status: 'ok', fields: parsed } : { status: 'unreadable' },
      retrySameModel: false,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      const transient = isTransient(error);
      logger[transient ? 'warn' : 'error']('ai receipt failed', {
        provider: 'gemini',
        model,
        status: error.status,
        message: error.message.slice(0, 200),
      });
      return { outcome: { status: 'unavailable' }, retrySameModel: transient };
    }

    if (signal?.aborted) {
      logger.info('ai receipt cancelled', { provider: 'gemini', model });
      return { outcome: { status: 'unavailable' }, retrySameModel: false };
    }

    logger.warn('ai receipt failed', { provider: 'gemini', model, ...describeError(error) });
    return { outcome: { status: 'unavailable' }, retrySameModel: true };
  }
}

type Attempted = { index: number; outcome: ReadOutcome };

function firstRead(attempts: readonly Promise<Attempted>[]): Promise<{
  won?: Attempted;
  all: Attempted[];
}> {
  return new Promise((resolve) => {
    const all: Attempted[] = [];
    let pending = attempts.length;
    for (const attempt of attempts) {
      void attempt.then((entry) => {
        all.push(entry);
        pending -= 1;
        if (entry.outcome.status === 'ok') resolve({ won: entry, all });
        else if (pending === 0) resolve({ all });
      });
    }
  });
}

async function readWithModel(
  model: string,
  file: ReceiptFile,
  allowedCategories: readonly string[],
  apiKey: string,
  signal: AbortSignal | undefined,
): Promise<ReadOutcome> {
  let verdict: ReadOutcome = { status: 'unavailable' };

  for (let attempt = 0; attempt < ATTEMPTS_PER_MODEL; attempt += 1) {
    if (signal?.aborted) break;
    if (attempt > 0) await sleep(RETRY_DELAY_MS);

    const tried = await readOnce(model, file, allowedCategories, apiKey, signal);
    verdict = tried.outcome;

    if (!tried.retrySameModel) break;
  }

  return verdict;
}

export const readReceiptWithGemini: ReadReceipt = async (file, allowedCategories, options) => {
  const config = getConfig();
  if (!config.GEMINI_API_KEY) return { status: 'unavailable' };

  const models = [...new Set([config.GEMINI_MODEL, config.GEMINI_FALLBACK_MODEL])];
  const apiKey = config.GEMINI_API_KEY;

  if (options?.signal?.aborted) return { status: 'unavailable' };

  const controllers = models.map(() => new AbortController());
  const onAbort = () => controllers.forEach((controller) => controller.abort());
  options?.signal?.addEventListener('abort', onAbort, { once: true });

  const started = new Map<number, Promise<ReadOutcome>>();
  const start = (index: number): Promise<ReadOutcome> => {
    const existing = started.get(index);
    if (existing) return existing;
    const model = models[index];
    const controller = controllers[index];
    if (model === undefined || controller === undefined)
      return Promise.resolve({ status: 'unavailable' });
    const run = readWithModel(model, file, allowedCategories, apiKey, controller.signal);
    started.set(index, run);
    return run;
  };

  try {
    const primary = start(0).then((outcome) => ({ index: 0, outcome }));
    if (models.length === 1) return (await primary).outcome;

    const hedgeTimer = sleep(HEDGE_AFTER_MS).then(() => 'hedge' as const);
    const firstEvent = await Promise.race([primary, hedgeTimer]);

    if (firstEvent !== 'hedge' && firstEvent.outcome.status === 'ok') {
      return firstEvent.outcome;
    }
    if (firstEvent === 'hedge') logger.info('ai receipt hedged', { after: HEDGE_AFTER_MS });

    const fallback = start(1).then((outcome) => ({ index: 1, outcome }));
    const { won, all: settled } = await firstRead([primary, fallback]);

    if (won) {
      if (won.index > 0) logger.info('ai receipt recovered', { model: models[won.index] });
      return won.outcome;
    }

    const foundNothing = settled.some((entry) => entry.outcome.status === 'unreadable');
    const neverAnswered = settled.some((entry) => entry.outcome.status === 'unavailable');
    const outcome: ReadOutcome =
      foundNothing && !neverAnswered ? { status: 'unreadable' } : { status: 'unavailable' };

    logger.warn('ai receipt found nothing', {
      models: models.length,
      outcome: outcome.status,
      foundNothing,
      neverAnswered,
    });
    return outcome;
  } finally {
    controllers.forEach((controller) => controller.abort());
    options?.signal?.removeEventListener('abort', onAbort);
  }
};
