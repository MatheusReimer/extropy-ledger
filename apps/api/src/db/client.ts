import { MongoClient, type Collection, type Db } from 'mongodb';
import { getConfig } from '../config.js';
import { logger } from '../lib/logger.js';
import type { BudgetDoc, CategoryDoc, ExpenseDoc, RateDoc, ReceiptDoc, UserDoc } from './types.js';

let clientPromise: Promise<MongoClient> | undefined;

async function connect(): Promise<MongoClient> {
  const config = getConfig();
  const client = new MongoClient(config.MONGODB_URI, {
    maxPoolSize: 5,
    minPoolSize: 0,
    serverSelectionTimeoutMS: 5_000,
    retryWrites: true,
  });
  await client.connect();
  logger.info('mongo connected', { database: config.MONGODB_DB });
  return client;
}

export async function getDb(): Promise<Db> {
  clientPromise ??= connect().catch((error: unknown) => {
    clientPromise = undefined;
    throw error;
  });
  const client = await clientPromise;
  return client.db(getConfig().MONGODB_DB);
}

export type Collections = {
  users: Collection<UserDoc>;
  categories: Collection<CategoryDoc>;
  expenses: Collection<ExpenseDoc>;
  receipts: Collection<ReceiptDoc>;
  rates: Collection<RateDoc>;
  budgets: Collection<BudgetDoc>;
};

async function rawCollections(): Promise<Collections> {
  const db = await getDb();
  return {
    users: db.collection<UserDoc>('users'),
    categories: db.collection<CategoryDoc>('categories'),
    expenses: db.collection<ExpenseDoc>('expenses'),
    receipts: db.collection<ReceiptDoc>('receipts'),
    rates: db.collection<RateDoc>('rates'),
    budgets: db.collection<BudgetDoc>('budgets'),
  };
}

let indexesPromise: Promise<void> | undefined;

async function ensureIndexes(): Promise<void> {
  indexesPromise ??= (async () => {
    const { users, categories, expenses, receipts, rates, budgets } = await rawCollections();
    await Promise.all([
      users.createIndex({ email: 1 }, { unique: true }),
      categories.createIndex({ userId: 1, nameKey: 1 }, { unique: true }),
      expenses.createIndex({ userId: 1, date: -1 }),
      expenses.createIndex({ userId: 1, categoryId: 1, date: -1 }),
      receipts.createIndex({ userId: 1, createdAt: -1 }),
      receipts.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      rates.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),

      budgets.createIndex({ userId: 1, categoryId: 1 }, { unique: true }),
    ]);
    logger.info('mongo indexes ensured');
  })().catch((error: unknown) => {
    indexesPromise = undefined;
    throw error;
  });

  return indexesPromise;
}

export async function getCollections(): Promise<Collections> {
  const [collections] = await Promise.all([rawCollections(), ensureIndexes()]);
  return collections;
}

export async function closeDb(): Promise<void> {
  const client = await clientPromise;
  await client?.close();
  clientPromise = undefined;
  indexesPromise = undefined;
}
