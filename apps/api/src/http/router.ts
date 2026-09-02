import { logger, describeError } from '../lib/logger.js';
import { parseJsonBody } from './body.js';
import { HttpError, notFound, toErrorResponse } from './errors.js';
import type { HttpRequest, HttpResponse, Route } from './types.js';

export type RouteMatch = {
  readonly route: Route;
  readonly params: Record<string, string>;
};

/**
 * What an adapter hands over: everything except the parsed body and the path
 * params, both of which the dispatcher produces.
 */
export type IncomingRequest = Omit<HttpRequest, 'body' | 'params'> & {
  readonly rawBody: string | undefined;
};

export type Dispatcher = (request: IncomingRequest) => Promise<HttpResponse>;

const splitPath = (path: string): string[] => path.split('/').filter(Boolean);

/**
 * Pure route matching - no state, no I/O, no framework.
 *
 * An Express instance for ten routes would drag middleware, a body parser and a
 * mutable req/res model into a Lambda that already receives a fully-formed
 * event. Sixty lines cost less than the dependency.
 */
export function matchRoute(
  routes: readonly Route[],
  method: string,
  path: string,
): RouteMatch | undefined {
  const segments = splitPath(path);

  for (const route of routes) {
    if (route.method !== method) continue;

    const pattern = splitPath(route.path);
    if (pattern.length !== segments.length) continue;

    const params: Record<string, string> = {};
    const matched = pattern.every((patternSegment, index) => {
      const segment = segments[index];
      if (segment === undefined) return false;
      if (patternSegment.startsWith(':')) {
        params[patternSegment.slice(1)] = decodeURIComponent(segment);
        return true;
      }
      return patternSegment === segment;
    });

    if (matched) return { route, params };
  }

  return undefined;
}

/**
 * Closes the route table into a single function, with the error boundary built in.
 *
 * This is the only place on the backend that catches a generic exception:
 * handlers throw `HttpError` and let anything unexpected bubble, because
 * try/catch in every route is exactly how a handler ends up swallowing a real
 * bug and returning 200.
 *
 * JSON parsing happens INSIDE that boundary rather than in the adapters. When it
 * lived in the adapters, a curl with a trailing comma escaped this catch and got
 * logged as a 500-level error with a stack trace - a client mistake raising an
 * operational alarm.
 */
export function createDispatcher(routes: readonly Route[]): Dispatcher {
  return async (incoming: IncomingRequest): Promise<HttpResponse> => {
    const started = Date.now();
    const { rawBody, ...rest } = incoming;
    const match = matchRoute(routes, incoming.method, incoming.path);

    try {
      if (!match) throw notFound(`No route for ${incoming.method} ${incoming.path}`);

      const response = await match.route.handler({
        ...rest,
        params: match.params,
        body: parseJsonBody(rawBody),
      });
      logger.info('request', {
        method: incoming.method,
        route: match.route.path,
        status: response.status,
        durationMs: Date.now() - started,
      });
      return response;
    } catch (error) {
      const response = toErrorResponse(error);
      const level = response.status >= 500 ? 'error' : 'warn';
      logger[level]('request failed', {
        method: incoming.method,
        route: match?.route.path ?? incoming.path,
        status: response.status,
        durationMs: Date.now() - started,
        // A stack trace only helps for a bug. On an expected 4xx it is noise
        // that makes the log harder to read, not easier.
        ...(error instanceof HttpError ? { code: error.code } : describeError(error)),
      });
      return response;
    }
  };
}
