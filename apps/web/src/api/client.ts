import type { ApiErrorBody, FieldErrors } from '@expense/shared';

/**
 * Where the API lives, defaulting to a same-origin "/api".
 *
 * In dev the Vite proxy forwards that to the local server; in production the
 * same CloudFront distribution that serves the site forwards it to API Gateway.
 * Either way there is no API URL baked into the bundle.
 *
 * A BLANK value counts as unset, and that distinction is the whole reason this
 * is a function. `.env.example` ships `VITE_API_URL=` empty, Vite hands that
 * through as `''`, and `''` is not nullish - so a `??` default silently leaves
 * the base URL empty and every request goes to `/auth/signup` instead of
 * `/api/auth/signup`. Same rule as the backend applies to blanks in `.env`.
 */
export function resolveApiBaseUrl(configured: string | undefined): string {
  const trimmed = configured?.trim();
  return (trimmed ? trimmed : '/api').replace(/\/+$/, '');
}

const BASE_URL = resolveApiBaseUrl(import.meta.env.VITE_API_URL);

/** A typed error: the UI branches on `status`/`fields`, never on message text. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: FieldErrors,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const isFieldError = (error: unknown): error is ApiError & { fields: FieldErrors } =>
  error instanceof ApiError && error.fields !== undefined;

type RequestOptions = {
  method?: string;
  body?: unknown;
  token?: string | undefined;
  query?: Record<string, string | undefined>;
  signal?: AbortSignal;
};

const buildUrl = (path: string, query: RequestOptions['query']): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== '') search.set(key, value);
  }
  const suffix = search.toString();
  return `${BASE_URL}${path}${suffix ? `?${suffix}` : ''}`;
};

/**
 * A single exit point to the network.
 *
 * The auth header, serialisation, and the translation of an API error into
 * `ApiError` live here and only here - no component calls `fetch`. That is what
 * makes it possible to change the transport (or add token refresh) without
 * touching a single screen.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, token, query, signal } = options;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(signal ? { signal } : {}),
    });
  } catch (cause) {
    // A network failure has no HTTP status; 0 distinguishes "never reached the
    // server" from "the server answered with an error" - the UI words them
    // differently.
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ApiError(0, 'network_error', 'Could not reach the server. Check your connection.');
  }

  if (response.status === 204) return undefined as T;

  const payload: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    const error = (payload as ApiErrorBody | undefined)?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'unknown_error',
      error?.message ?? 'Something went wrong',
      error?.fields,
    );
  }

  return payload as T;
}
