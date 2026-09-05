import { parseOrFieldErrors } from '@expense/shared';
import type { ZodType } from 'zod';
import { unprocessable } from './errors.js';

export function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  const result = parseOrFieldErrors(schema, input);
  if (!result.ok) throw unprocessable(result.fields);
  return result.data;
}
