// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

export function sanitizeText(value: string, maxLength = 200): string {
  return value.replace(CONTROL_CHARS, '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}
