import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { en } from '../src/i18n/en';
import { es } from '../src/i18n/es';
import { pt } from '../src/i18n/pt';

/**
 * Guards against the defect that actually happened here.
 *
 * Seven keys - three of them the "could not be converted" notice the README
 * promised - sat in all three dictionaries with nothing rendering them. The
 * types cannot catch that: `Dictionary` proves every locale has the SAME keys,
 * never that any of them is reached. Only a scan of the source can.
 *
 * A dead string is worse than clutter in a translated app: it is three
 * translations of a sentence no user will read, and it makes the dictionary a
 * poor record of what the UI actually says.
 */

const SRC = path.join(import.meta.dirname, '..', 'src');

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) && !full.includes(`${path.sep}i18n${path.sep}`) ? [full] : [];
  });

const consumingSource = sourceFiles(SRC)
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n');

describe('translation keys', () => {
  it('are every one of them reachable from the UI', () => {
    const unused = Object.keys(en).filter((key) => !consumingSource.includes(`'${key}'`));
    expect(unused).toEqual([]);
  });

  /**
   * The type already pins this, but the assertion names the failure: a locale
   * that silently loses a key would otherwise surface as `undefined` rendered
   * into the page.
   */
  it('match across all three locales', () => {
    expect(Object.keys(es)).toEqual(Object.keys(en));
    expect(Object.keys(pt)).toEqual(Object.keys(en));
  });

  it('are never blank in any locale', () => {
    for (const [name, dictionary] of [
      ['en', en],
      ['es', es],
      ['pt', pt],
    ] as const) {
      const blank = Object.entries(dictionary)
        .filter(([, value]) => value.trim() === '')
        .map(([key]) => key);
      expect(blank, `blank in ${name}`).toEqual([]);
    }
  });

  /**
   * Spanish and Portuguese shipped with every accent stripped - "Contrasena",
   * "Visao geral", "Cotacoes". Both files were already UTF-8, so nothing forced
   * it; it simply read as broken to anyone who speaks either language. These
   * are the letters whose absence was the tell.
   */
  it('carry the diacritics their language requires', () => {
    expect(Object.values(es).join(' ')).toMatch(/[áéíóúñ¿]/);
    expect(Object.values(pt).join(' ')).toMatch(/[ãâáêéõôóç]/);
  });
});
