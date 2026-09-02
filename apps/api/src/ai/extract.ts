import { sanitizeText, type ExtractedFields } from '@expense/shared';
import type { ReceiptMimeType } from '@expense/shared';
import type { ReadOutcome } from './providers/types.js';

export type ReceiptFile = { bytes: Buffer; mimeType: ReceiptMimeType };

export type ExtractDeps = {
  readReceipt: (file: ReceiptFile, allowedCategories: readonly string[]) => Promise<ReadOutcome>;
};

/**
 * There is no rule pre-pass here, and that is the honest asymmetry.
 *
 * Categorising a typed description has a cheap deterministic shortcut, because
 * "Starbucks" is a lookup. Reading a photograph does not: there is no version of
 * this that answers without a model. So the cascade for uploads is one step and
 * a graceful failure, rather than three - and pretending otherwise would be
 * architecture for its own sake.
 *
 * Groq cannot take images at all, so this path has no second provider either.
 * The consequence is contained: a failed extraction means the user types the
 * expense the way they always could.
 */
export async function extractExpense(
  file: ReceiptFile,
  allowedCategories: readonly string[],
  deps: ExtractDeps,
): Promise<ReadOutcome> {
  const outcome = await deps.readReceipt(file, allowedCategories);
  if (outcome.status !== 'ok') return outcome;

  // Same normalisation the manual path applies, so text off a receipt cannot
  // carry control characters into the database that a typed entry could not.
  return {
    status: 'ok',
    fields: {
      ...outcome.fields,
      merchant: outcome.fields.merchant === null ? null : sanitizeText(outcome.fields.merchant, 120),
      description:
        outcome.fields.description === null ? null : sanitizeText(outcome.fields.description, 200),
    },
  };
}

/** A ledger row, not a paragraph - the schema allows 200, this is what reads well. */
const DESCRIPTION_DISPLAY_MAX = 72;

/**
 * Builds the description the form will show.
 *
 * Merchant plus summary reads the way a person would write it - "Harbor & Pine -
 * dinner for two" - and either half alone is still useful.
 *
 * Capped well under the schema limit because a chatty model will happily return
 * every line item on the receipt, and 200 characters of that turns a table row
 * into a wall of text. The user can always type more; they rarely want to delete
 * more.
 */
export function toDescription(extracted: ExtractedFields): string {
  const parts = [extracted.merchant, extracted.description].filter(
    (part): part is string => Boolean(part),
  );
  return sanitizeText(parts.join(' - '), DESCRIPTION_DISPLAY_MAX);
}
