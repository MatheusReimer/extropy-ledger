import { createCategorySchema, sanitizeText, type CategoryDto } from '@expense/shared';
import { MongoServerError, ObjectId } from 'mongodb';
import { toCategoryDto } from '../db/mappers.js';
import { conflict } from '../http/errors.js';
import type { AuthedHandler } from '../http/types.js';
import { parseInput } from '../http/validate.js';
import { toObjectId } from '../lib/ids.js';

const DUPLICATE_KEY = 11000;

export const listCategories: AuthedHandler = async (request) => {
  const docs = await request.repos.categories.list();
  const body: CategoryDto[] = docs.map(toCategoryDto);
  return { status: 200, body };
};

export const createCategory: AuthedHandler = async (request) => {
  const input = parseInput(createCategorySchema, request.body);
  const name = sanitizeText(input.name, 40);

  const doc = {
    _id: new ObjectId(),
    userId: toObjectId(request.userId),
    name,
    nameKey: name.toLowerCase(),
    isCustom: true,
    createdAt: new Date(),
  };

  try {
    await request.repos.categories.insert(doc);
  } catch (error) {
    // Uniqueness is enforced by the INDEX, not by a findOne before the insert:
    // two simultaneous requests would both pass that check and both create a
    // duplicate. Letting the database decide, then translating its error, is the
    // version without the race.
    if (error instanceof MongoServerError && error.code === DUPLICATE_KEY) {
      throw conflict(`You already have a category named "${name}"`);
    }
    throw error;
  }

  return { status: 201, body: toCategoryDto(doc) };
};
