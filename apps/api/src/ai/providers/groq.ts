import Groq from 'groq-sdk';
import { getConfig } from '../../config.js';
import { logger, describeError } from '../../lib/logger.js';
import { buildSystemPrompt, buildUserPrompt } from '../prompt.js';
import { jsonResponseSchema } from '../schema.js';
import { parseModelResponse } from '../parse.js';
import type { AskModel } from './types.js';

const MAX_TOKENS = 128;

let client: Groq | undefined;

export const askGroq: AskModel = async (input, allowedCategories, options) => {
  const config = getConfig();
  if (!config.GROQ_API_KEY) return undefined;

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
