import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { getConfig } from './config.js';
import { resolveCorsHeaders } from './http/cors.js';
import { toErrorResponse } from './http/errors.js';
import { createDispatcher } from './http/router.js';
import { serveStatic } from './http/static.js';
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

/**
 * Where the built site lives, when this Lambda is also serving it.
 *
 * Unset in the normal deployment: CloudFront serves the site from S3 and strips
 * the `/api` prefix at the edge, so this Lambda only ever sees API paths. Set,
 * and the same function answers for both - see `http/static.ts` for why that
 * exists and what it costs.
 */
const STATIC_DIR = process.env['SERVE_STATIC_DIR'];

/**
 * The API lives under `/api` from the browser's point of view either way.
 *
 * CloudFront strips that prefix before the request arrives; without CloudFront
 * nothing does, so it is stripped here. Doing it unconditionally is safe - a
 * stripped path never starts with `/api` again - and it keeps one rule instead
 * of two deployment-shaped behaviours.
 */
const apiPath = (rawPath: string): string | undefined => {
  if (!STATIC_DIR) return rawPath;
  if (rawPath === '/api') return '/';
  return rawPath.startsWith('/api/') ? rawPath.slice(4) : undefined;
};

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

    const routePath = apiPath(event.rawPath);

    // Not an API path, and we are serving the site: it is a page or an asset.
    if (routePath === undefined && STATIC_DIR) {
      const asset = await serveStatic(STATIC_DIR, event.rawPath);
      if (asset) {
        const { 'X-Base64': base64, ...headers } = asset.headers ?? {};
        return {
          statusCode: asset.status,
          headers,
          body: String(asset.body),
          ...(base64 ? { isBase64Encoded: true } : {}),
        };
      }
      return { statusCode: 404, headers: { 'Content-Type': 'text/plain' }, body: 'Not found' };
    }

    const response = await dispatch({
      method,
      path: routePath ?? event.rawPath,
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
