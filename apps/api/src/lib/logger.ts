/**
 * Structured JSON logging, one line per event.
 *
 * CloudWatch indexes JSON automatically, so `fields` becomes queryable in Logs
 * Insights with no parser. No request body is ever logged - the auth routes
 * carry a plaintext password, and "we only log the interesting ones" is the rule
 * someone forgets under pressure. Simpler never to log bodies at all.
 */
type Level = 'info' | 'warn' | 'error';

type Fields = Record<string, unknown>;

function emit(level: Level, message: string, fields: Fields): void {
  const line = JSON.stringify({ level, message, timestamp: new Date().toISOString(), ...fields });
  if (level === 'info') {
    process.stdout.write(`${line}\n`);
    return;
  }
  console.error(line);
}

export const logger = {
  info: (message: string, fields: Fields = {}) => emit('info', message, fields),
  warn: (message: string, fields: Fields = {}) => emit('warn', message, fields),
  error: (message: string, fields: Fields = {}) => emit('error', message, fields),
};

/** Extracts the useful minimum from a caught `unknown`, without dumping the whole object. */
export function describeError(error: unknown): Fields {
  if (error instanceof Error) {
    return { errorName: error.name, errorMessage: error.message, stack: error.stack };
  }
  return { errorName: 'UnknownError', errorMessage: String(error) };
}
