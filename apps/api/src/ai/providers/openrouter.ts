import { getConfig } from '../../config.js';
import { logger, describeError } from '../../lib/logger.js';
import { buildReceiptSystemPrompt, jsonReceiptSchema } from '../receipt-schema.js';
import { parseExtractedExpense } from '../receipt-parse.js';
import type { ReadReceipt } from './types.js';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

const MAX_TOKENS = 900;

const JSON_RULE = `

Reply with a single JSON object and nothing else - no prose, no markdown, no code fence.
Keys exactly: merchant, description, amount, currency, date, category, confidence.`;

function extractJson(content: string): unknown {
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start === -1 || end <= start) return undefined;
  return JSON.parse(content.slice(start, end + 1));
}

type ChatResponse = {
  choices?: { message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
};

export const readReceiptWithOpenRouter: ReadReceipt = async (file, allowedCategories, options) => {
  const config = getConfig();
  if (!config.OPENROUTER_API_KEY) return { status: 'unavailable' };
  if (options?.signal?.aborted) return { status: 'unavailable' };

  const model = config.OPENROUTER_MODEL;
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
          { role: 'system', content: buildReceiptSystemPrompt(allowedCategories) + JSON_RULE },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Extract the expense from this receipt or invoice.' },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'extracted_expense',
            schema: jsonReceiptSchema(allowedCategories),
          },
        },
        max_tokens: MAX_TOKENS,
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
