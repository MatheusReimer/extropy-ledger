import { Binary, ObjectId } from 'mongodb';
import type { ReceiptDto, ReceiptMimeType } from '@expense/shared';
import { notFound } from '../http/errors.js';
import type { AuthedHandler } from '../http/types.js';
import type { Repositories } from '../db/repositories/types.js';
import { toObjectId } from '../lib/ids.js';

const UNCLAIMED_TTL_MS = 24 * 60 * 60 * 1000;

export async function storeReceipt(
  repos: Repositories,
  userId: ObjectId,
  file: { bytes: Buffer; mimeType: ReceiptMimeType },
  fileName: string,
): Promise<ObjectId> {
  const doc = {
    _id: new ObjectId(),
    userId,
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

export async function claimReceipt(
  receipts: Repositories['receipts'],
  receiptId: ObjectId,
): Promise<ObjectId | undefined> {
  return (await receipts.claim(receiptId)) ? receiptId : undefined;
}

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
    headers: { 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=300' },
  };
};
