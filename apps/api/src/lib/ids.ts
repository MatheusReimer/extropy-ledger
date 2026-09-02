import { ObjectId } from 'mongodb';
import { badRequest } from '../http/errors.js';

/**
 * Converts 24-char hex into an ObjectId, or 400s. No raw string ever reaches a
 * query.
 */
export function toObjectId(value: string, field = 'id'): ObjectId {
  if (!ObjectId.isValid(value)) throw badRequest(`Invalid ${field}`);
  return new ObjectId(value);
}
