const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

export function escapeCsvValue(value: string | number): string {
  const raw = String(value);

  const defused = FORMULA_PREFIXES.some((prefix) => raw.startsWith(prefix)) ? `'${raw}` : raw;

  return `"${defused.replaceAll('"', '""')}"`;
}

export function toCsv(
  headers: readonly string[],
  rows: readonly (readonly (string | number)[])[],
): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCsvValue).join(','));

  return `${lines.join('\r\n')}\r\n`;
}
