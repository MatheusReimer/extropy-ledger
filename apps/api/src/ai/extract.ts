import { sanitizeText, type ExtractedFields } from '@expense/shared';
import type { ReceiptMimeType } from '@expense/shared';
import type { ReadOutcome } from './providers/types.js';

export type ReceiptFile = { bytes: Buffer; mimeType: ReceiptMimeType };

export type ExtractDeps = {
  readReceipt: (file: ReceiptFile, allowedCategories: readonly string[]) => Promise<ReadOutcome>;
};

export async function extractExpense(
  file: ReceiptFile,
  allowedCategories: readonly string[],
  deps: ExtractDeps,
): Promise<ReadOutcome> {
  const outcome = await deps.readReceipt(file, allowedCategories);
  if (outcome.status !== 'ok') return outcome;

  return {
    status: 'ok',
    fields: {
      ...outcome.fields,
      merchant:
        outcome.fields.merchant === null ? null : sanitizeText(outcome.fields.merchant, 120),
      description:
        outcome.fields.description === null ? null : sanitizeText(outcome.fields.description, 200),
    },
  };
}

const DESCRIPTION_DISPLAY_MAX = 72;

export function toDescription(extracted: ExtractedFields): string {
  const parts = [extracted.merchant, extracted.description].filter((part): part is string =>
    Boolean(part),
  );
  return sanitizeText(parts.join(' - '), DESCRIPTION_DISPLAY_MAX);
}
