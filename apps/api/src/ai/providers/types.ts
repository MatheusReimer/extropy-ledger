import type { ExtractedFields, ReceiptMimeType } from '@expense/shared';
import type { ModelCategory } from '../parse.js';

export type CategorizeInput = { description: string; amountCents?: number | undefined };

export type AskOptions = { signal?: AbortSignal | undefined };

export type AskModel = (
  input: CategorizeInput,
  allowedCategories: readonly string[],
  options?: AskOptions,
) => Promise<ModelCategory | undefined>;

export type Provider = {
  readonly name: string;
  readonly ask: AskModel;
};

export type ReceiptFile = { bytes: Buffer; mimeType: ReceiptMimeType };

export type ReadOutcome =
  { status: 'ok'; fields: ExtractedFields } | { status: 'unreadable' } | { status: 'unavailable' };

export type ReadReceipt = (
  file: ReceiptFile,
  allowedCategories: readonly string[],
  options?: AskOptions,
) => Promise<ReadOutcome>;
