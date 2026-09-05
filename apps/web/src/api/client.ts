import type { ApiErrorBody, FieldErrors } from '@expense/shared';

export function resolveApiBaseUrl(configured: string | undefined): string {
  const trimmed = configured?.trim();
  return (trimmed ? trimmed : '/api').replace(/\/+$/, '');
}

const BASE_URL = resolveApiBaseUrl(import.meta.env.VITE_API_URL);

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
