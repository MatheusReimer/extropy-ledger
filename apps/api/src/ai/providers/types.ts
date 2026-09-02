import type { ExtractedFields, ReceiptMimeType } from '@expense/shared';
import type { ModelCategory } from '../parse.js';

export type CategorizeInput = { description: string; amountCents?: number | undefined };

/**
 * A deadline for the whole chain, handed down to each provider.
 *
 * Budgeting per provider would mean the worst case grows every time one is
 * added: two providers at five seconds each is a ten-second wait on a form. One
 * shared signal keeps the ceiling fixed no matter how long the chain gets.
 */
export type AskOptions = { signal?: AbortSignal | undefined };

/**
 * The contract every provider implements.
 *
 * `undefined` means "no usable answer" for ANY reason - no key, rate limited,
 * timed out, malformed output. Providers never throw, because the caller's job
 * is to try the next one, not to classify someone else's failure.
 */
export type AskModel = (
  input: CategorizeInput,
  allowedCategories: readonly string[],
  options?: AskOptions,
) => Promise<ModelCategory | undefined>;

export type Provider = {
  /** Appears in logs, so a failing provider is identifiable without guesswork. */
  readonly name: string;
  readonly ask: AskModel;
};

export type ReceiptFile = { bytes: Buffer; mimeType: ReceiptMimeType };

/**
 * Reading a document is a separate capability from classifying a string, and
 * deliberately a separate type.
 *
 * Only multimodal providers can implement it - Groq's text models cannot take an
 * image at all - so folding it into `AskModel` would have produced a chain whose
 * members silently do different things. Two contracts make the asymmetry visible
 * in the type system instead of in a runtime surprise.
 */
/**
 * Why a read produced nothing, because the two reasons need different words.
 *
 * `unreadable` means the model looked and found no expense - a blurry photo, a
 * cropped corner, a page that is not a receipt. Retrying is pointless and the
 * user needs to act.
 *
 * `unavailable` means we never got an answer: rate limited, overloaded, timed
 * out. The document is very likely fine and retrying is exactly the right move.
 *
 * Collapsing both into `undefined` is what made the app tell people to take a
 * clearer photo when the real problem was a busy free tier.
 */
export type ReadOutcome =
  | { status: 'ok'; fields: ExtractedFields }
  | { status: 'unreadable' }
  | { status: 'unavailable' };

export type ReadReceipt = (
  file: ReceiptFile,
  allowedCategories: readonly string[],
  options?: AskOptions,
) => Promise<ReadOutcome>;
