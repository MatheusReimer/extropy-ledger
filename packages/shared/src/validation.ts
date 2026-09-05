import type { ZodError, ZodType } from 'zod';

export type FieldErrors = Record<string, string>;

export function toFieldErrors(error: ZodError): FieldErrors {
  const fields: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_';
    fields[key] ??= issue.message;
  }
  return fields;
}

export type ParseResult<T> = { ok: true; data: T } | { ok: false; fields: FieldErrors };

export function parseOrFieldErrors<T>(schema: ZodType<T>, input: unknown): ParseResult<T> {
  const result = schema.safeParse(input);
  return result.success
    ? { ok: true, data: result.data }
    : { ok: false, fields: toFieldErrors(result.error) };
}
