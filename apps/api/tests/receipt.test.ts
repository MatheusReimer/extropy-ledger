import { describe, expect, it, vi } from 'vitest';
import { PREDEFINED_CATEGORIES } from '@expense/shared';
import { decodeUpload, sniffMimeType } from '../src/lib/files.js';
import { parseExtractedExpense } from '../src/ai/receipt-parse.js';
import { extractExpense, toDescription } from '../src/ai/extract.js';

const CATEGORIES = [...PREDEFINED_CATEGORIES];

const b64 = (bytes: number[]) => Buffer.from(bytes).toString('base64');
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34];
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const WEBP = [0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50];

describe('sniffMimeType', () => {
  it('recognises every format we accept', () => {
    expect(sniffMimeType(Uint8Array.from(PDF))).toBe('application/pdf');
    expect(sniffMimeType(Uint8Array.from(JPEG))).toBe('image/jpeg');
    expect(sniffMimeType(Uint8Array.from(PNG))).toBe('image/png');
    expect(sniffMimeType(Uint8Array.from(WEBP))).toBe('image/webp');
  });

  it('rejects bytes that are none of them', () => {
    expect(sniffMimeType(Uint8Array.from([0x4d, 0x5a, 0x90, 0x00]))).toBeUndefined(); // a Windows .exe
    expect(sniffMimeType(Uint8Array.from([]))).toBeUndefined();
  });

  it('does not mistake a bare RIFF container for WebP', () => {
    // RIFF is also WAV and AVI; only the tag at offset 8 makes it a WebP.
    const wav = [0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45];
    expect(sniffMimeType(Uint8Array.from(wav))).toBeUndefined();
  });
});

describe('decodeUpload', () => {
  it('accepts a real PDF and reports the sniffed type', () => {
    const result = decodeUpload(b64(PDF));
    expect(result.ok && result.mimeType).toBe('application/pdf');
  });

  it('strips a data: URI prefix, which is what a browser FileReader produces', () => {
    const result = decodeUpload(`data:application/pdf;base64,${b64(PDF)}`);
    expect(result.ok && result.mimeType).toBe('application/pdf');
  });

  /**
   * The security point of this module: a client can claim any Content-Type it
   * likes, so the claim is never consulted. Only the bytes decide.
   */
  it('rejects an executable no matter what the client called it', () => {
    const exe = [0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00];
    const result = decodeUpload(b64(exe));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toMatch(/not a PDF/i);
  });

  it('rejects an oversized file without decoding it', () => {
    // Well past the cap, but the size is derived from the string length, so no
    // multi-megabyte buffer is ever materialised to find that out.
    const huge = 'A'.repeat(10_000);
    const result = decodeUpload(huge, 1_000);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toMatch(/larger than/i);
  });

  it('rejects data that is not base64 at all', () => {
    const result = decodeUpload('not base64!!!');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toMatch(/base64/i);
  });

  it('rejects an empty payload', () => {
    expect(decodeUpload('').ok).toBe(false);
  });
});

describe('parseExtractedExpense', () => {
  const complete = {
    merchant: 'VERDE CAFE LTDA',
    description: 'Espresso blend, oat milk',
    amount: '240.45',
    currency: 'brl',
    date: '2026-08-14',
    category: 'Groceries',
    confidence: 0.95,
  };

  it('maps a complete extraction, converting the amount to cents', () => {
    expect(parseExtractedExpense(complete, CATEGORIES)).toEqual({
      merchant: 'VERDE CAFE LTDA',
      description: 'Espresso blend, oat milk',
      amountCents: 24_045,
      currency: 'BRL',
      date: '2026-08-14',
      category: 'Groceries',
      confidence: 0.95,
    });
  });

  /** The schema uses "" for "not found"; a null must reach the form as an empty field. */
  it('turns every empty string into null rather than a blank value', () => {
    const sparse = { ...complete, description: '', currency: '', date: '', category: '' };
    const result = parseExtractedExpense(sparse, CATEGORIES);
    expect(result?.description).toBeNull();
    expect(result?.currency).toBeNull();
    expect(result?.date).toBeNull();
    expect(result?.category).toBeNull();
    expect(result?.merchant).toBe('VERDE CAFE LTDA');
  });

  /**
   * A malformed date would otherwise sail through here and fail later against
   * the create-expense schema, at a point with no context to explain itself.
   */
  it('drops a date that is not YYYY-MM-DD', () => {
    expect(parseExtractedExpense({ ...complete, date: '14/08/2026' }, CATEGORIES)?.date).toBeNull();
  });

  it('drops an amount it cannot parse rather than guessing', () => {
    expect(parseExtractedExpense({ ...complete, amount: 'R$ 240,45 total' }, CATEGORIES)?.amountCents).toBeNull();
  });

  it('accepts a comma decimal separator, as printed on a Brazilian receipt', () => {
    expect(parseExtractedExpense({ ...complete, amount: '240,45' }, CATEGORIES)?.amountCents).toBe(24_045);
  });

  it('refuses a category the user does not have', () => {
    expect(parseExtractedExpense({ ...complete, category: 'Crypto' }, CATEGORIES)?.category).toBeNull();
  });

  it('clamps a confidence outside 0..1', () => {
    expect(parseExtractedExpense({ ...complete, confidence: 4 }, CATEGORIES)?.confidence).toBe(1);
    expect(parseExtractedExpense({ ...complete, confidence: 'high' }, CATEGORIES)?.confidence).toBe(0);
  });

  it('gives up entirely when there is neither an amount nor a merchant', () => {
    const nothing = { ...complete, merchant: '', amount: '' };
    expect(parseExtractedExpense(nothing, CATEGORIES)).toBeUndefined();
  });

  it('rejects a non-object payload', () => {
    expect(parseExtractedExpense('240.45', CATEGORIES)).toBeUndefined();
  });
});

/**
 * Not every model returns the amount as the string the schema asks for.
 * Gemini does, because its schema constrains decoding; an OpenAI-compatible
 * model reading the same schema returned `"amount": 123.76` - a number, and the
 * right one. Throwing away a correct answer over its JSON type is brittleness.
 */
describe('parseExtractedExpense amount typing', () => {
  it('accepts the amount as a number as well as a string', () => {
    const asString = parseExtractedExpense(
      { merchant: 'X', description: 'y', amount: '123.76', currency: 'USD', date: '2026-08-14', category: 'Dining', confidence: 0.9 },
      CATEGORIES,
    );
    const asNumber = parseExtractedExpense(
      { merchant: 'X', description: 'y', amount: 123.76, currency: 'USD', date: '2026-08-14', category: 'Dining', confidence: 0.9 },
      CATEGORIES,
    );
    expect(asString?.amountCents).toBe(12_376);
    expect(asNumber?.amountCents).toBe(12_376);
  });

  it('still refuses a number that is not a usable amount', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -12.5]) {
      const result = parseExtractedExpense(
        { merchant: 'X', description: 'y', amount: bad, currency: 'USD', date: '2026-08-14', category: 'Dining', confidence: 0.9 },
        CATEGORIES,
      );
      expect(result?.amountCents ?? null).toBeNull();
    }
  });
});

describe('extractExpense', () => {
  const file = { bytes: Buffer.from(PDF), mimeType: 'application/pdf' as const };

  it('sanitises text taken off a receipt, exactly as the manual path does', async () => {
    const readReceipt = vi.fn().mockResolvedValue({
      status: 'ok',
      fields: {
        merchant: '  VERDE  CAFE  ',
        description: 'Coffee beans',
        amountCents: 24_045,
        currency: 'BRL',
        date: '2026-08-14',
        category: 'Groceries',
        confidence: 0.9,
      },
    });
    const result = await extractExpense(file, CATEGORIES, { readReceipt });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.fields.merchant).toBe('VERDE CAFE');
    expect(result.fields.description).toBe('Coffee beans');
  });

  /**
   * The distinction that stops the app blaming a photo for a busy API.
   * "Unreadable" asks the user to act; "unavailable" asks them to wait.
   */
  it('passes an unreadable document straight through', async () => {
    const readReceipt = vi.fn().mockResolvedValue({ status: 'unreadable' });
    await expect(extractExpense(file, CATEGORIES, { readReceipt })).resolves.toEqual({
      status: 'unreadable',
    });
  });

  it('passes an unavailable reader straight through, distinctly', async () => {
    const readReceipt = vi.fn().mockResolvedValue({ status: 'unavailable' });
    await expect(extractExpense(file, CATEGORIES, { readReceipt })).resolves.toEqual({
      status: 'unavailable',
    });
  });
});

describe('toDescription', () => {
  const base = {
    merchant: 'Verde Cafe',
    description: 'espresso blend, oat milk',
    amountCents: 1,
    currency: 'BRL',
    date: null,
    category: null,
    confidence: 1,
  };

  it('joins merchant and summary the way a person would write it', () => {
    expect(toDescription(base)).toBe('Verde Cafe - espresso blend, oat milk');
  });

  it('uses whichever half it has', () => {
    expect(toDescription({ ...base, description: null })).toBe('Verde Cafe');
    expect(toDescription({ ...base, merchant: null })).toBe('espresso blend, oat milk');
  });

  it('is empty when it has neither', () => {
    expect(toDescription({ ...base, merchant: null, description: null })).toBe('');
  });
});
