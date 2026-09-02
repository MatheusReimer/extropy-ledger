/**
 * Normalises user-supplied text before it is persisted.
 *
 * This is NOT the XSS defence — that belongs to rendering (React escapes by
 * default, and nothing in this codebase uses `dangerouslySetInnerHTML`). What
 * this module prevents is garbage in the database: control characters, runs of
 * whitespace, and oversized strings that pollute indexes and reports.
 */

/**
 * C0 controls + DEL.
 *
 * The `no-control-regex` rule exists to catch a control character that slipped
 * into a pattern by accident. Here they are precisely the target, so disabling
 * the rule on this line is more honest than rewriting the range to fool it.
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

export function sanitizeText(value: string, maxLength = 200): string {
  return value.replace(CONTROL_CHARS, '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}
