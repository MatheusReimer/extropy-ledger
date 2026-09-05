import type { Repositories } from '../db/repositories/types.js';

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

export type AuthedRequest = HttpRequest & {
  readonly userId: string;
  readonly repos: Repositories;
};

export type AuthedHandler = (request: AuthedRequest) => Promise<HttpResponse>;

export type Route = {
  readonly method: string;
  readonly path: string;
  readonly handler: Handler;
};
