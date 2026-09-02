import { getConfig } from '../../config.js';
import { logger, describeError } from '../../lib/logger.js';
import { buildReceiptSystemPrompt, jsonReceiptSchema } from '../receipt-schema.js';
import { parseExtractedExpense } from '../receipt-parse.js';
import type { ReadReceipt } from './types.js';

/**
 * The second VENDOR for reading receipts.
 *
 * Everything in `gemini.ts` is Google. Hedging two Gemini models covers a
 * congested model, which is the common failure, but not a revoked key, an
 * exhausted daily quota, or Google having a bad afternoon - in all three the
 * whole ladder dies at once. This is the rung that survives that.
 *
 * OpenRouter rather than a specific vendor because it is one key over many
 * models, several of which are free and take images; the model is configuration,
 * so trading it later is an env var rather than a new adapter. Written against
 * the OpenAI-compatible shape by hand - the whole call is thirty lines, and a
 * second SDK to hold thirty lines is not a trade worth making.
 */
const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

/** Thinking tokens count against this, so it is generous relative to the answer. */
const MAX_TOKENS = 900;

/**
 * The instruction that actually produces JSON here.
 *
 * `response_format` is listed as supported and is not honoured: asked with
 * `json_schema` and `strict: true`, the model read the receipt perfectly and
 * replied in **markdown prose** - "- **Merchant:** Harbor & Pine". Gemini needs
 * none of this because its `responseSchema` constrains decoding; an
 * OpenAI-compatible router only passes the field upstream and hopes.
 *
 * Tested across three free models: with this line every one returned JSON, with
 * or without `response_format`. Without it, none did. So the sentence is the
 * mechanism and the header is the belt.
 */
const JSON_RULE = `

Reply with a single JSON object and nothing else - no prose, no markdown, no code fence.
Keys exactly: merchant, description, amount, currency, date, category, confidence.`;

/**
 * Pulls the object out of whatever wrapping came back.
 *
 * Replies arrive fenced (```json ... ```) or with leading blank lines often
 * enough that `JSON.parse` on the raw string throws on a perfectly good answer.
 * Taking the outermost braces is tolerant of both without being tolerant of
 * nonsense - anything that is not an object still fails to parse.
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
  error?: { message?: string };
};

export const readReceiptWithOpenRouter: ReadReceipt = async (
  file,
  allowedCategories,
  options,
) => {
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
              // The same data URL shape a browser would send; PDFs go here too.
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        // Kept because it costs nothing and helps where it IS honoured. It is
        // not what makes this work - `JSON_RULE` is.
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
      // The body carries the real reason; the status alone says very little on
      // a router that proxies many upstreams.
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

    // Same rule as the Gemini path: only a model that ANSWERED may call a
    // document unreadable. Anything that threw never got as far as looking.
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
