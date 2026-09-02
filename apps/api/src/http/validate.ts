import { parseOrFieldErrors } from '@expense/shared';
import type { ZodType } from 'zod';
import { unprocessable } from './errors.js';

/**
 * One front door for user-supplied data.
 *
 * Every handler starts here, and the schema comes from `packages/shared` - the
 * SAME one the React form uses. No field reaches the database without passing a
 * schema first: that is how input sanitisation stops being a discipline someone
 * has to remember and becomes a type.
 */
export function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  const result = parseOrFieldErrors(schema, input);
  if (!result.ok) throw unprocessable(result.fields);
  return result.data;
}
