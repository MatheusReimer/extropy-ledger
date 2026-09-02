import { badRequest } from './errors.js';

/**
 * Malformed JSON is a CLIENT error - 400, not 500.
 *
 * Letting `JSON.parse` throw raw would turn a curl with a trailing comma into an
 * internal-error alarm in CloudWatch.
 */
export function parseJsonBody(raw: string | undefined): unknown {
  if (!raw || raw.trim() === '') return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    throw badRequest('Request body is not valid JSON');
  }
}
