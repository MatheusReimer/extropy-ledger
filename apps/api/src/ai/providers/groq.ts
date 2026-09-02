import Groq from 'groq-sdk';
import { getConfig } from '../../config.js';
import { logger, describeError } from '../../lib/logger.js';
import { buildSystemPrompt, buildUserPrompt } from '../prompt.js';
import { jsonResponseSchema } from '../schema.js';
import { parseModelResponse } from '../parse.js';
import type { AskModel } from './types.js';

/** No hidden reasoning to budget for here, so the answer's own size is enough. */
const MAX_TOKENS = 128;

let client: Groq | undefined;

/**
 * The second opinion, on independent infrastructure.
 *
 * The point is not a better model - this task is easy enough that model quality
 * barely matters. The point is that Gemini's free tier returned 503/504 on
 * roughly a third of calls under load, and a retry against the same provider
 * would just queue behind the same congestion.
 */
export const askGroq: AskModel = async (input, allowedCategories, options) => {
  const config = getConfig();
  if (!config.GROQ_API_KEY) return undefined;

  // Retrying inside a provider defeats the point of having a second one.
  client ??= new Groq({ apiKey: config.GROQ_API_KEY, maxRetries: 0 });

  try {
    const response = await client.chat.completions.create(
      {
        model: config.GROQ_MODEL,
        messages: [
          { role: 'system', content: buildSystemPrompt(allowedCategories) },
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
        max_tokens: MAX_TOKENS,
        temperature: 0,
      },
      { ...(options?.signal ? { signal: options.signal } : {}) },
    );

    const parsed = parseModelResponse(
      response.choices[0]?.message.content ?? undefined,
      allowedCategories,
    );
    logger.info('ai provider answered', {
      provider: 'groq',
      model: config.GROQ_MODEL,
      matched: Boolean(parsed),
      inputTokens: response.usage?.prompt_tokens,
      outputTokens: response.usage?.completion_tokens,
    });
    return parsed;
  } catch (error) {
    if (error instanceof Groq.APIError) {
      // Groq validates the generated JSON server-side and returns 400 when the
      // model fails to satisfy the schema - roughly one call in eight, measured.
      // That is the model falling short, not a malformed request from us, so it
      // belongs with the routine failures the next step absorbs. Any other 400
      // really is our bug and stays at error level.
      const generationFailed = error.message.includes('Failed to validate JSON');
      const routine = error.status === 429 || (error.status ?? 0) >= 500 || generationFailed;
      logger[routine ? 'warn' : 'error']('ai provider failed', {
        provider: 'groq',
        status: error.status,
        message: error.message.slice(0, 200),
      });
    } else {
      logger.warn('ai provider failed', { provider: 'groq', ...describeError(error) });
    }
    return undefined;
  }
};
