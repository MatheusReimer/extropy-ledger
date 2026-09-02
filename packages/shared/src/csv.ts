/**
 * CSV generation, with the two hazards that make hand-rolled CSV go wrong.
 *
 * The first is quoting: a description containing a comma, a quote or a newline
 * must not be able to invent extra columns or rows.
 *
 * The second is FORMULA INJECTION, which is the one people miss. Excel, Sheets
 * and LibreOffice treat a cell beginning `=`, `+`, `-`, `@`, or a lone tab or
 * carriage return as a formula - so an expense described as
 * `=HYPERLINK("http://evil","Click")` becomes a live link in the victim's
 * spreadsheet, and `=cmd|'/c calc'!A0` has historically been worse than that.
 * The export is written by one user and opened by them, but "the attacker and
 * the victim are the same person" stops being true the moment a file is shared,
 * and the receipt reader already puts model-extracted text into descriptions.
 * OWASP files this under injection; the fix is one character and belongs here.
 */

/** Characters a spreadsheet will treat as the start of a formula. */
const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

export function escapeCsvValue(value: string | number): string {
  const raw = String(value);

  // A leading apostrophe makes the spreadsheet treat what follows as text. It is
  // added INSIDE the quotes so it survives parsing as part of the value.
  const defused = FORMULA_PREFIXES.some((prefix) => raw.startsWith(prefix)) ? `'${raw}` : raw;

  // Always quote, and double any embedded quote. Quoting unconditionally is a
  // deliberate choice over quoting only when required: it is one rule instead of
  // a list of exceptions, and every CSV reader accepts it.
  return `"${defused.replaceAll('"', '""')}"`;
}

export function toCsv(headers: readonly string[], rows: readonly (readonly (string | number)[])[]): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCsvValue).join(','));

  // CRLF per RFC 4180, and a trailing newline so the last row is terminated.
  return `${lines.join('\r\n')}\r\n`;
}
