const COMBINING_MARKS = /[̀-ͯ]/g;

export function normalizeDescription(description: string): string {
  return description
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
