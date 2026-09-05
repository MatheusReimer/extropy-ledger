import { logger, describeError } from '../lib/logger.js';
import { parseJsonBody } from './body.js';
import { HttpError, notFound, toErrorResponse } from './errors.js';
import type { HttpRequest, HttpResponse, Route } from './types.js';

export type RouteMatch = {
  readonly route: Route;
  readonly params: Record<string, string>;
};

export type IncomingRequest = Omit<HttpRequest, 'body' | 'params'> & {
  readonly rawBody: string | undefined;
};

export type Dispatcher = (request: IncomingRequest) => Promise<HttpResponse>;

const splitPath = (path: string): string[] => path.split('/').filter(Boolean);

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
        ...(error instanceof HttpError ? { code: error.code } : describeError(error)),
      });
      return response;
    }
  };
}
