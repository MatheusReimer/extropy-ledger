/** The combining-diacritic range NFD leaves behind. */
const COMBINING_MARKS = /[̀-ͯ]/g;

/**
 * Shared normalisation between the rule pre-pass and the cache key.
 *
 * "Uber Eats", "uber eats " and "UBER  EATS" have to collide, otherwise the
 * cache misses and a rule stops matching because of one extra space.
 */
export function normalizeDescription(description: string): string {
  return description
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
