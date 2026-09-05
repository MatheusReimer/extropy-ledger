import { z } from 'zod';

export const RECEIPT_MAX_BYTES = 4 * 1024 * 1024;

export const RECEIPT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type ReceiptMimeType = (typeof RECEIPT_MIME_TYPES)[number];

export const extractReceiptSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(RECEIPT_MIME_TYPES),
  data: z.string().min(1, 'File is empty'),
});

export type ExtractReceiptInput = z.infer<typeof extractReceiptSchema>;

export type ExtractedFields = {
  merchant: string | null;
  description: string | null;
  amountCents: number | null;
  currency: string | null;
  date: string | null;
  category: string | null;
  confidence: number;
};

export type ExtractedExpense = ExtractedFields & { receiptId: string };
