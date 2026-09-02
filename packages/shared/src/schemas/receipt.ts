import { z } from 'zod';

/**
 * 4 MB of raw file.
 *
 * The file travels base64-encoded inside the JSON body, which inflates it by a
 * third: 4 MB becomes ~5.4 MB on the wire, comfortably under Lambda's 6 MB
 * synchronous payload limit. Anything larger needs a presigned S3 upload, which
 * is a different design and out of scope here.
 */
export const RECEIPT_MAX_BYTES = 4 * 1024 * 1024;

/**
 * What the model can actually read. PDFs cover invoices; the image types cover
 * the far more common case of a photograph of a paper receipt.
 */
export const RECEIPT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type ReceiptMimeType = (typeof RECEIPT_MIME_TYPES)[number];

export const extractReceiptSchema = z.object({
  /** Shown back to the user so they can tell which file was read. Never used as a path. */
  fileName: z.string().trim().min(1).max(255),
  /**
   * What the browser CLAIMS the file is. The server sniffs the actual bytes and
   * ignores this on mismatch - see `lib/files.ts`.
   */
  mimeType: z.enum(RECEIPT_MIME_TYPES),
  /** The file itself, base64-encoded. */
  data: z.string().min(1, 'File is empty'),
});

export type ExtractReceiptInput = z.infer<typeof extractReceiptSchema>;

/**
 * What the model found, as a DRAFT for the user to confirm.
 *
 * Every field is nullable because a real receipt can be creased, cropped or
 * simply missing a date. A null is an honest "not found" that leaves the form
 * field empty; inventing a plausible value would be far worse on a financial
 * record.
 */
export type ExtractedFields = {
  merchant: string | null;
  description: string | null;
  amountCents: number | null;
  /** ISO 4217 as printed on the document, so the UI can flag a mismatch. */
  currency: string | null;
  date: string | null;
  category: string | null;
  confidence: number;
};

/**
 * The fields, plus a handle on the stored file.
 *
 * The parser produces `ExtractedFields` and knows nothing about storage; the
 * route adds `receiptId`. Keeping them apart means the "don't trust the model"
 * logic stays testable without a database anywhere near it.
 */
export type ExtractedExpense = ExtractedFields & { receiptId: string };
