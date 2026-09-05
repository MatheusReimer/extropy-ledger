import { getConfig } from '../../config.js';
import { logger, describeError } from '../../lib/logger.js';
import { buildSystemPrompt, buildUserPrompt } from '../prompt.js';
import { jsonResponseSchema } from '../schema.js';
import { parseModelCategory } from '../parse.js';
import { buildReceiptSystemPrompt, jsonReceiptSchema } from '../receipt-schema.js';
import { parseExtractedExpense } from '../receipt-parse.js';
import type { AskModel, ReadReceipt } from './types.js';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

const CATEGORY_MAX_TOKENS = 300;
const RECEIPT_MAX_TOKENS = 900;

const categoryJsonRule = `

Reply with a single JSON object and nothing else - no prose, no markdown, no code fence.
Keys exactly: category, confidence.`;

const receiptJsonRule = `

Reply with a single JSON object and nothing else - no prose, no markdown, no code fence.
Keys exactly: merchant, description, amount, currency, date, category, confidence.`;

/**
 * OpenRouter advertising `response_format` does not mean the upstream honours
 * it, so the object is dug out of whatever came back rather than assumed to be
 * the whole body.
 */
function extractJson(content: string): unknown {
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start === -1 || end <= start) return undefined;
  return JSON.parse(content.slice(start, end + 1));
}

type ChatResponse = {
  choices?: { message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

export const askOpenRouter: AskModel = async (input, allowedCategories, options) => {
  const config = getConfig();
  if (!config.OPENROUTER_API_KEY) return undefined;

  const model = config.OPENROUTER_CATEGORIZE_MODEL;

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: buildSystemPrompt(allowedCategories) + categoryJsonRule },
          { role: 'user', content: buildUserPrompt(input) },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'expense_category',
            schema: jsonResponseSchema(allowedCategories),
            strict: true,
          },
        },
        max_tokens: CATEGORY_MAX_TOKENS,
        temperature: 0,
      }),
      ...(options?.signal ? { signal: options.signal } : {}),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      const routine = response.status === 429 || response.status >= 500;
      logger[routine ? 'warn' : 'error']('ai provider failed', {
        provider: 'openrouter',
        model,
        status: response.status,
        message: detail.slice(0, 200),
      });
      return undefined;
    }

    const body = (await response.json()) as ChatResponse;
    const content = body.choices?.[0]?.message?.content;
    const parsed = (() => {
      if (!content) return undefined;
      try {
        return parseModelCategory(extractJson(content), allowedCategories);
      } catch {
        return undefined;
      }
    })();

    logger.info('ai provider answered', {
      provider: 'openrouter',
      model,
      matched: Boolean(parsed),
      inputTokens: body.usage?.prompt_tokens,
      outputTokens: body.usage?.completion_tokens,
    });
    return parsed;
  } catch (error) {
    if (options?.signal?.aborted) {
      logger.info('ai provider cancelled', { provider: 'openrouter', model });
      return undefined;
    }
    logger.warn('ai provider failed', { provider: 'openrouter', model, ...describeError(error) });
    return undefined;
  }
};

export const readReceiptWithOpenRouter: ReadReceipt = async (file, allowedCategories, options) => {
  const config = getConfig();
  if (!config.OPENROUTER_API_KEY) return { status: 'unavailable' };
  if (options?.signal?.aborted) return { status: 'unavailable' };

  const model = config.OPENROUTER_RECEIPT_MODEL;
  const isPdf = file.mimeType === 'application/pdf';
  const dataUrl = `data:${file.mimeType};base64,${file.bytes.toString('base64')}`;

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: buildReceiptSystemPrompt(allowedCategories) + receiptJsonRule,
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Extract the expense from this receipt or invoice.' },
              isPdf
                ? { type: 'file', file: { filename: 'receipt.pdf', file_data: dataUrl } }
                : { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        // A PDF is not an image, and sending one as `image_url` is a 400. The
        // file-parser plugin is what makes the fallback cover every type the
        // upload accepts rather than images only.
        ...(isPdf ? { plugins: [{ id: 'file-parser', pdf: { engine: 'pdf-text' } }] } : {}),
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'extracted_expense',
            schema: jsonReceiptSchema(allowedCategories),
          },
        },
        max_tokens: RECEIPT_MAX_TOKENS,
        temperature: 0,
      }),
      ...(options?.signal ? { signal: options.signal } : {}),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      logger.warn('ai receipt failed', {
        provider: 'openrouter',
        model,
        status: response.status,
        message: detail.slice(0, 200),
      });
      return { status: 'unavailable' };
    }

    const body = (await response.json()) as ChatResponse;
    const parsed = (() => {
      const content = body.choices?.[0]?.message?.content;
      if (!content) return undefined;
      try {
        return parseExtractedExpense(extractJson(content), allowedCategories);
      } catch {
        return undefined;
      }
    })();

    logger.info('ai receipt read', {
      provider: 'openrouter',
      model,
      mimeType: file.mimeType,
      bytes: file.bytes.length,
      matched: Boolean(parsed),
      confidence: parsed?.confidence,
      inputTokens: body.usage?.prompt_tokens,
      outputTokens: body.usage?.completion_tokens,
    });

    return parsed ? { status: 'ok', fields: parsed } : { status: 'unreadable' };
  } catch (error) {
    if (options?.signal?.aborted) {
      logger.info('ai receipt cancelled', { provider: 'openrouter', model });
      return { status: 'unavailable' };
    }
    logger.warn('ai receipt failed', { provider: 'openrouter', model, ...describeError(error) });
    return { status: 'unavailable' };
  }
};
