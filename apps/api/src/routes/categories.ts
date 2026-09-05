import {
  CATEGORY_NAME_MAX,
  FALLBACK_CATEGORY,
  createCategorySchema,
  renameCategorySchema,
  sanitizeText,
  type CategoryDto,
} from '@expense/shared';
import { MongoServerError, ObjectId } from 'mongodb';
import { toCategoryDto } from '../db/mappers.js';
import type { CategoryDoc } from '../db/types.js';
import { conflict, forbidden, notFound } from '../http/errors.js';
import type { AuthedHandler, AuthedRequest } from '../http/types.js';
import { parseInput } from '../http/validate.js';
import { toObjectId } from '../lib/ids.js';

const DUPLICATE_KEY = 11000;

const FALLBACK_KEY = FALLBACK_CATEGORY.toLowerCase();

const isFallback = (doc: CategoryDoc): boolean => !doc.isCustom && doc.nameKey === FALLBACK_KEY;

async function requireCategory(request: AuthedRequest, action: string): Promise<CategoryDoc> {
  const id = toObjectId(request.params['id'] ?? '');
  const doc = await request.repos.categories.findById(id);
  if (!doc) throw notFound('Category not found');

  if (isFallback(doc)) {
    throw forbidden(
      `"${doc.name}" is where anything uncategorised lands, so it cannot be ${action}.`,
    );
  }

  return doc;
}

export const listCategories: AuthedHandler = async (request) => {
  const docs = await request.repos.categories.list();
  const body: CategoryDto[] = docs.map(toCategoryDto);
  return { status: 200, body };
};

export const createCategory: AuthedHandler = async (request) => {
  const input = parseInput(createCategorySchema, request.body);
  const name = sanitizeText(input.name, CATEGORY_NAME_MAX);

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
    if (error instanceof MongoServerError && error.code === DUPLICATE_KEY) {
      throw conflict(`You already have a category named "${name}"`);
    }
    throw error;
  }

  return { status: 201, body: toCategoryDto(doc) };
};

export const renameCategory: AuthedHandler = async (request) => {
  const input = parseInput(renameCategorySchema, request.body);
  const existing = await requireCategory(request, 'renamed');

  const name = sanitizeText(input.name, CATEGORY_NAME_MAX);
  const nameKey = name.toLowerCase();

  const all = await request.repos.categories.list();
  if (all.some((doc) => doc.nameKey === nameKey && !doc._id.equals(existing._id))) {
    throw conflict(`You already have a category named "${name}"`);
  }

  try {
    const updated = await request.repos.categories.rename(existing._id, name, nameKey);
    if (!updated) throw notFound('Category not found');
    return { status: 200, body: toCategoryDto(updated) };
  } catch (error) {
    if (error instanceof MongoServerError && error.code === DUPLICATE_KEY) {
      throw conflict(`You already have a category named "${name}"`);
    }
    throw error;
  }
};

export const deleteCategory: AuthedHandler = async (request) => {
  const existing = await requireCategory(request, 'removed');

  const inUse = await request.repos.expenses.countByCategory(existing._id);
  if (inUse > 0) {
    throw conflict(
      `"${existing.name}" still has ${inUse} ${inUse === 1 ? 'expense' : 'expenses'}. ` +
        'Move them to another category first.',
    );
  }

  const removed = await request.repos.categories.remove(existing._id);
  if (!removed) throw notFound('Category not found');

  await request.repos.budgets.remove(existing._id);

  return { status: 204 };
};
