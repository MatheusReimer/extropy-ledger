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

/**
 * The suggestion is scoped to THIS user's categories, custom ones included.
 *
 * Passing the fixed predefined list would be simpler and wrong: someone who
 * created "Pets" would never be offered "Pets". Because that list becomes the
 * `enum` in the tool schema, the model is also blocked from suggesting something
 * that does not exist in the account that asked.
 */
export const categorizeExpense: AuthedHandler = async (request) => {
  const input = parseInput(categorizeRequestSchema, request.body);

  const docs = await request.repos.categories.list();
  const names = docs.map((doc) => doc.name);

  const result = await categorize(input, names, { askModel });
  return { status: 200, body: result };
};

/**
 * Reading a document is slower than classifying a string, and gets its own budget.
 *
 * The categorisation chain runs on a blur event where anything past eight
 * seconds is worse than useless. An upload is a deliberate act with a visible
 * progress state, so a person will happily wait longer - but not forever, and
 * not past the Lambda's own timeout.
 */
const EXTRACT_BUDGET_MS = 25_000;

export const extractExpenseFromReceipt: AuthedHandler = async (request) => {
  const input = parseInput(extractReceiptSchema, request.body);

  // Decode and sniff BEFORE anything else touches the bytes. The client's
  // declared mimeType is not consulted again past this line.
  const decoded = decodeUpload(input.data);
  if (!decoded.ok) throw unprocessable({ file: decoded.reason });

  const userId = toObjectId(request.userId);
  const docs = await request.repos.categories.list();

  // Stored before the model is asked, so the id exists regardless of how the
  // read goes. An upload nobody saves is swept by the TTL index rather than
  // needing a rollback path here.
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

  /**
   * Two failures, two answers, because they ask different things of the user.
   *
   * 503 means the reader never got back to us - the document is probably fine
   * and trying again is the right move, so the client offers exactly that. 422
   * means the model looked and found no expense, which retrying cannot fix.
   *
   * These used to share one message, and it told people to take a clearer photo
   * when the actual problem was a busy free tier. The receipt is stored either
   * way, so a retry re-reads a file already on the server.
   */
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
