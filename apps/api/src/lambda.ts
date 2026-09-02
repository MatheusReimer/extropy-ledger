import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { getConfig } from './config.js';
import { resolveCorsHeaders } from './http/cors.js';
import { toErrorResponse } from './http/errors.js';
import { createDispatcher } from './http/router.js';
import { describeError, logger } from './lib/logger.js';
import { routes } from './routes/index.js';

/**
 * API Gateway -> core adapter. No business logic lives here.
 *
 * The rest of the backend does not know Lambda exists; this file and `local.ts`
 * are the only two translations, and that is why `pnpm dev` runs exactly the
 * same code that ships to production.
 */
const dispatch = createDispatcher(routes);

const decodeBody = (event: APIGatewayProxyEventV2): string | undefined =>
  event.isBase64Encoded && event.body
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;

export const handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const origin = event.headers['origin'] ?? event.headers['Origin'];

  try {
    const config = getConfig();
    const corsHeaders = resolveCorsHeaders(origin, config.corsOrigins);
    const method = event.requestContext.http.method;

    // A preflight should touch neither the database nor a route - answer and exit.
    if (method === 'OPTIONS') return { statusCode: 204, headers: corsHeaders };

    const response = await dispatch({
      method,
      path: event.rawPath,
      query: event.queryStringParameters
        ? Object.fromEntries(
            Object.entries(event.queryStringParameters).filter(
              (entry): entry is [string, string] => entry[1] !== undefined,
            ),
          )
        : {},
      headers: event.headers,
      rawBody: decodeBody(event),
    });

    return {
      statusCode: response.status,
      headers: {
        ...corsHeaders,
        ...(response.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...response.headers,
      },
      ...(response.body === undefined ? {} : { body: JSON.stringify(response.body) }),
    };
  } catch (error) {
    // Only reached for failures OUTSIDE the dispatcher - invalid configuration,
    // essentially. Everything a request can do to itself is already handled in
    // there, so anything landing here really is a 500.
    logger.error('unhandled lambda error', describeError(error));
    const response = toErrorResponse(error);
    return {
      statusCode: response.status,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(response.body),
    };
  }
};
