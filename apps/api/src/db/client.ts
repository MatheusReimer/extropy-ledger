import { MongoClient, type Collection, type Db } from 'mongodb';
import { getConfig } from '../config.js';
import { logger } from '../lib/logger.js';
import type { BudgetDoc, CategoryDoc, ExpenseDoc, RateDoc, ReceiptDoc, UserDoc } from './types.js';

/**
 * One connection per Lambda container, not one per invocation.
 *
 * The Atlas free tier (M0) caps at 500 connections. Opening a fresh pool per
 * request exhausts that under very little concurrency, and the Lambda then fails
 * on connection timeouts rather than on any bug in the code. Caching the PROMISE
 * (rather than the client) also serialises concurrent invocations that race
 * during the same cold start.
 */
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
    // Without this, one failed connection stays cached forever and the container
    // never recovers - the next invocation gets to try again.
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

/** Raw accessor - used only by `ensureIndexes`, which cannot depend on itself. */
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

/**
 * Indexes guaranteed once per container.
 *
 * `createIndex` is idempotent, so this is safe; in a larger system it would be a
 * deploy-time migration instead of work on the request path - a conscious
 * trade-off to keep the MVP down to a single setup command.
 */
async function ensureIndexes(): Promise<void> {
  indexesPromise ??= (async () => {
    const { users, categories, expenses, receipts, rates, budgets } = await rawCollections();
    await Promise.all([
      users.createIndex({ email: 1 }, { unique: true }),
      categories.createIndex({ userId: 1, nameKey: 1 }, { unique: true }),
      // Every expense access is scoped by user - the index mirrors that.
      expenses.createIndex({ userId: 1, date: -1 }),
      expenses.createIndex({ userId: 1, categoryId: 1, date: -1 }),
      receipts.createIndex({ userId: 1, createdAt: -1 }),
      // Mongo's TTL monitor deletes a document once `expiresAt` is in the past.
      // Claiming a receipt unsets the field, which takes it out of scope
      // permanently - so unsaved uploads clean themselves up and saved ones stay.
      receipts.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      // Only "latest" rates carry expiresAt; dated ones are immutable and stay.
      rates.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),

      // One budget per category per user - the unique key is what makes the
      // upsert in `setBudget` safe against two tabs saving at once.
      budgets.createIndex({ userId: 1, categoryId: 1 }, { unique: true }),
    ]);
    logger.info('mongo indexes ensured');
  })().catch((error: unknown) => {
    indexesPromise = undefined;
    throw error;
  });

  return indexesPromise;
}

/**
 * The only public way to reach a collection - and so the only place that has to
 * remember the indexes.
 *
 * Leaving that to the adapters would mean two places to forget it, and a new
 * route touching the database without the uniqueness guarantee. Here the
 * guarantee is structural: if you are holding a collection, the indexes exist.
 * `/health` never calls this, so it still answers while the database is down.
 */
export async function getCollections(): Promise<Collections> {
  const [collections] = await Promise.all([rawCollections(), ensureIndexes()]);
  return collections;
}

/** Used only by the local dev server, so Ctrl+C shuts down cleanly. */
export async function closeDb(): Promise<void> {
  const client = await clientPromise;
  await client?.close();
  clientPromise = undefined;
  indexesPromise = undefined;
}
