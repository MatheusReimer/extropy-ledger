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

const ATTEMPTS = 2;

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

export const readReceiptWithGemini: ReadReceipt = async (file, allowedCategories, options) => {
  const config = getConfig();
  if (!config.GEMINI_API_KEY) return { status: 'unavailable' };
  if (options?.signal?.aborted) return { status: 'unavailable' };

  const model = config.GEMINI_MODEL;
  let verdict: ReadOutcome = { status: 'unavailable' };

  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    if (options?.signal?.aborted) break;
    if (attempt > 0) await sleep(RETRY_DELAY_MS);

    const tried = await readOnce(
      model,
      file,
      allowedCategories,
      config.GEMINI_API_KEY,
      options?.signal,
    );
    verdict = tried.outcome;

    if (!tried.retrySameModel) break;
  }

  return verdict;
};
