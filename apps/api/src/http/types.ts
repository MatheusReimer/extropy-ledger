import type { Repositories } from '../db/repositories/types.js';

/**
 * Transport-independent request and response shapes.
 *
 * Handlers never see an `APIGatewayProxyEventV2` or an `IncomingMessage` - only
 * these types. That is what lets the SAME code run on Lambda and on the local
 * dev server, and be tested without standing up either one.
 */
export type HttpRequest = {
  readonly method: string;
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly params: Readonly<Record<string, string>>;
  readonly body: unknown;
};

export type HttpResponse = {
  readonly status: number;
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
};

export type Handler = (request: HttpRequest) => Promise<HttpResponse>;

/**
 * An authenticated request - `userId` and `repos` only exist after the middleware.
 *
 * `repos` is the persistence surface already bound to `userId`. Handlers get
 * their database access through it and never open a collection themselves, which
 * is what makes an unscoped query unwritable rather than merely discouraged.
 */
export type AuthedRequest = HttpRequest & {
  readonly userId: string;
  readonly repos: Repositories;
};

export type AuthedHandler = (request: AuthedRequest) => Promise<HttpResponse>;

export type Route = {
  readonly method: string;
  /** Pattern with dynamic segments: `/expenses/:id`. */
  readonly path: string;
  readonly handler: Handler;
};
