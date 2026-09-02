import { Binary, ObjectId } from 'mongodb';
import type { ReceiptDto, ReceiptMimeType } from '@expense/shared';
import { notFound } from '../http/errors.js';
import type { AuthedHandler } from '../http/types.js';
import type { Repositories } from '../db/repositories/types.js';
import { toObjectId } from '../lib/ids.js';

/**
 * How long an unclaimed upload survives.
 *
 * Long enough that someone can upload, wander off to check the amount, and come
 * back; short enough that a browser tab closed on a half-filled form does not
 * leave a megabyte behind forever. A TTL index on `expiresAt` does the sweeping.
 */
const UNCLAIMED_TTL_MS = 24 * 60 * 60 * 1000;

/** Stores an upload and hands back the id an expense can later claim. */
export async function storeReceipt(
  repos: Repositories,
  userId: ObjectId,
  file: { bytes: Buffer; mimeType: ReceiptMimeType },
  fileName: string,
): Promise<ObjectId> {
  const doc = {
    _id: new ObjectId(),
    userId,
    // The SNIFFED type. The browser's claim was discarded back in `decodeUpload`
    // and must not creep back in here, because this value becomes the
    // Content-Type a browser is later told to render.
    mimeType: file.mimeType,
    fileName,
    bytes: file.bytes.length,
    data: new Binary(file.bytes),
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + UNCLAIMED_TTL_MS),
  };
  await repos.receipts.insert(doc);
  return doc._id;
}

/**
 * Attaches a receipt to an expense, or refuses.
 *
 * Scoped by `userId` in the filter rather than checked beforehand, for the same
 * reason every other query here is: a receipt belonging to someone else must be
 * indistinguishable from one that does not exist.
 *
 * Clearing `expiresAt` is what promotes it from a temporary upload to a kept
 * document - the TTL index only sees fields that are set.
 */
export async function claimReceipt(
  receipts: Repositories['receipts'],
  receiptId: ObjectId,
): Promise<ObjectId | undefined> {
  return (await receipts.claim(receiptId)) ? receiptId : undefined;
}

/**
 * Returns the file base64-encoded inside JSON, not as raw bytes.
 *
 * Serving binary through API Gateway needs binary media types configured on the
 * stage and the Lambda replying with `isBase64Encoded`, which is a deployment
 * detail that breaks quietly and differs between local and deployed. Base64 in
 * JSON costs a third more bytes on a file already capped at 4 MB, and works
 * identically in both places. The client turns it back into a data URL.
 */
export const getReceipt: AuthedHandler = async (request) => {
  const doc = await request.repos.receipts.findById(toObjectId(request.params['id'] ?? ''));
  if (!doc) throw notFound('Receipt not found');

  const body: ReceiptDto = {
    id: doc._id.toHexString(),
    mimeType: doc.mimeType,
    fileName: doc.fileName,
    data: Buffer.from(doc.data.buffer).toString('base64'),
  };

  return {
    status: 200,
    body,
    // The stored type came from sniffing real bytes, but `nosniff` costs nothing
    // and closes the door on a browser deciding it knows better.
    headers: { 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=300' },
  };
};
