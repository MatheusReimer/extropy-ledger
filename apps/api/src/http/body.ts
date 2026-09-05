import { badRequest } from './errors.js';

export function parseJsonBody(raw: string | undefined): unknown {
  if (!raw || raw.trim() === '') return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    throw badRequest('Request body is not valid JSON');
  }
}
