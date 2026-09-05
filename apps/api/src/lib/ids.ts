import { ObjectId } from 'mongodb';
import { badRequest } from '../http/errors.js';

export function toObjectId(value: string, field = 'id'): ObjectId {
  if (!ObjectId.isValid(value)) throw badRequest(`Invalid ${field}`);
  return new ObjectId(value);
}
