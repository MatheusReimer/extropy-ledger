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

export function describeError(error: unknown): Fields {
  if (error instanceof Error) {
    return { errorName: error.name, errorMessage: error.message, stack: error.stack };
  }
  return { errorName: 'UnknownError', errorMessage: String(error) };
}
