import { categorizeRequestSchema, extractReceiptSchema } from '@expense/shared';
import { askModel, readReceipt } from '../ai/providers/index.js';
import { extractExpense } from '../ai/extract.js';
import { decodeUpload } from '../lib/files.js';
import { HttpError, unprocessable } from '../http/errors.js';
import { storeReceipt } from './receipts.js';
import { categorize } from '../ai/categorize.js';
import type { AuthedHandler } from '../http/types.js';
import { parseInput } from '../http/validate.js';
import { toObjectId } from '../lib/ids.js';

export const categorizeExpense: AuthedHandler = async (request) => {
  const input = parseInput(categorizeRequestSchema, request.body);

  const docs = await request.repos.categories.list();
  const names = docs.map((doc) => doc.name);

  const result = await categorize(input, names, { askModel });
  return { status: 200, body: result };
};

const EXTRACT_BUDGET_MS = 25_000;

export const extractExpenseFromReceipt: AuthedHandler = async (request) => {
  const input = parseInput(extractReceiptSchema, request.body);

  const decoded = decodeUpload(input.data);
  if (!decoded.ok) throw unprocessable({ file: decoded.reason });

  const userId = toObjectId(request.userId);
  const docs = await request.repos.categories.list();

  const receiptId = await storeReceipt(
    request.repos,
    userId,
    { bytes: decoded.bytes, mimeType: decoded.mimeType },
    input.fileName,
  );

  const outcome = await extractExpense(
    { bytes: decoded.bytes, mimeType: decoded.mimeType },
    docs.map((doc) => doc.name),
    {
      readReceipt: (file, allowed) =>
        readReceipt(file, allowed, { signal: AbortSignal.timeout(EXTRACT_BUDGET_MS) }),
    },
  );

  if (outcome.status === 'unavailable') {
    throw new HttpError(
      503,
      'reader_unavailable',
      'The reader is busy right now. Try again in a moment, or enter the expense manually.',
    );
  }

  if (outcome.status === 'unreadable') {
    throw new HttpError(
      422,
      'extraction_failed',
      'Could not find an expense in that file. Try a clearer photo, or enter it manually.',
    );
  }

  return { status: 200, body: { ...outcome.fields, receiptId: receiptId.toHexString() } };
};
