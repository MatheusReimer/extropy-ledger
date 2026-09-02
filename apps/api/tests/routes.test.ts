import { beforeEach, describe, expect, it } from 'vitest';
import { ObjectId } from 'mongodb';
import { listBudgets, setBudget, deleteBudget } from '../src/routes/budgets.js';
import { createCategory, listCategories } from '../src/routes/categories.js';
import { deleteExpense, listExpenses, updateExpense } from '../src/routes/expenses.js';
import { HttpError } from '../src/http/errors.js';
import type { AuthedRequest } from '../src/http/types.js';
import type { CategoryDoc, ExpenseDoc, ReceiptDoc } from '../src/db/types.js';
import { fakeRepositories, type FakeRepositories } from './helpers/fake-repositories.js';

/**
 * Route handlers, exercised directly.
 *
 * These could not be written before the repository layer existed: every handler
 * opened a MongoDB collection itself, so testing one meant standing up a
 * database. The README used to say handlers were "covered indirectly, through
 * the pure functions they compose" - an honest description of a gap. This is
 * that gap closed.
 *
 * What is being tested is the part that only lives in the handler: status codes,
 * the shape of the response body, which failures become which HTTP error, and
 * the ordering of writes. None of that is reachable from a pure function.
 */

const USER = new ObjectId();
const OTHER = new ObjectId();

const category = (name: string, id = new ObjectId()): CategoryDoc => ({
  _id: id,
  userId: USER,
  name,
  nameKey: name.toLowerCase(),
  isCustom: false,
  createdAt: new Date(),
});

const expense = (over: Partial<ExpenseDoc> = {}): ExpenseDoc => ({
  _id: new ObjectId(),
  userId: USER,
  amountCents: 1_000,
  currency: 'USD',
  baseCents: 1_000,
  description: 'Lunch',
  categoryId: new ObjectId(),
  date: '2026-08-14',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

/** A request as the auth middleware would have built it. */
function authed(repos: FakeRepositories, over: Partial<AuthedRequest> = {}): AuthedRequest {
  return {
    method: 'GET',
    path: '/',
    query: {},
    headers: {},
    params: {},
    body: undefined,
    userId: USER.toHexString(),
    repos,
    ...over,
  };
}

describe('expense routes', () => {
  let repos: FakeRepositories;
  const dining = category('Dining');

  beforeEach(() => {
    repos = fakeRepositories({ categories: [dining] });
  });

  it('lists newest first and honours the limit', async () => {
    for (const date of ['2026-08-01', '2026-08-20', '2026-08-10']) {
      await repos.expenses.insert(expense({ date }));
    }

    const response = await listExpenses(authed(repos, { query: { limit: '2' } }));

    expect(response.status).toBe(200);
    const body = response.body as { date: string }[];
    expect(body.map((e) => e.date)).toEqual(['2026-08-20', '2026-08-10']);
  });

  it('filters by date range', async () => {
    for (const date of ['2026-07-31', '2026-08-15', '2026-09-01']) {
      await repos.expenses.insert(expense({ date }));
    }

    const response = await listExpenses(
      authed(repos, { query: { from: '2026-08-01', to: '2026-08-31' } }),
    );

    expect((response.body as unknown[]).length).toBe(1);
  });

  /**
   * The 404-not-403 rule, at the handler level.
   *
   * The repository cannot return another user's row, so the handler sees exactly
   * what it would see for an id that never existed - and must answer the same
   * way. A 403 here would confirm the id is real, which is the information an
   * attacker enumerating ids is after.
   */
  it('answers 404 for an expense the repository will not return', async () => {
    await expect(
      updateExpense(
        authed(repos, {
          params: { id: new ObjectId().toHexString() },
          body: { description: 'changed' },
        }),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('deletes the expense and its receipt together', async () => {
    const receiptId = new ObjectId();
    const receipt = {
      _id: receiptId,
      userId: USER,
      mimeType: 'image/jpeg',
      fileName: 'r.jpg',
      bytes: 10,
      createdAt: new Date(),
    } as unknown as ReceiptDoc;
    await repos.receipts.insert(receipt);
    const doc = expense({ receiptId });
    await repos.expenses.insert(doc);

    const response = await deleteExpense(
      authed(repos, { params: { id: doc._id.toHexString() } }),
    );

    expect(response.status).toBe(204);
    expect(repos.state.expenses).toHaveLength(0);
    // Keeping an orphaned photo of someone's bill after they deleted the record
    // is retention nobody agreed to - so this assertion is the point of the test.
    expect(repos.state.receipts).toHaveLength(0);
  });

  it('refuses an expense pointing at a category the repository does not have', async () => {
    await expect(
      updateExpense(
        authed(repos, {
          params: { id: new ObjectId().toHexString() },
          body: { categoryId: OTHER.toHexString() },
        }),
      ),
    ).rejects.toBeInstanceOf(HttpError);
  });
});

describe('budget routes', () => {
  let repos: FakeRepositories;
  const groceries = category('Groceries');

  beforeEach(() => {
    repos = fakeRepositories({ categories: [groceries] });
  });

  it('sets a budget and returns it', async () => {
    const response = await setBudget(
      authed(repos, {
        params: { categoryId: groceries._id.toHexString() },
        body: { limitCents: 30_000 },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ limitCents: 30_000 });
  });

  /** Twice is once: the upsert is what makes PUT the honest verb here. */
  it('is idempotent - setting twice leaves one budget', async () => {
    const params = { categoryId: groceries._id.toHexString() };
    await setBudget(authed(repos, { params, body: { limitCents: 30_000 } }));
    await setBudget(authed(repos, { params, body: { limitCents: 25_000 } }));

    expect(repos.state.budgets).toHaveLength(1);
    expect(repos.state.budgets[0]?.limitCents).toBe(25_000);
  });

  it('refuses to budget against a category it cannot see', async () => {
    await expect(
      setBudget(
        authed(repos, {
          params: { categoryId: OTHER.toHexString() },
          body: { limitCents: 100 },
        }),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('deleting a budget twice is a 404 the second time', async () => {
    const params = { categoryId: groceries._id.toHexString() };
    await setBudget(authed(repos, { params, body: { limitCents: 5_000 } }));

    expect((await deleteBudget(authed(repos, { params }))).status).toBe(204);
    await expect(deleteBudget(authed(repos, { params }))).rejects.toMatchObject({ status: 404 });
  });

  it('lists only what has been set', async () => {
    const empty = await listBudgets(authed(repos));
    expect(empty.body).toEqual([]);

    await setBudget(
      authed(repos, {
        params: { categoryId: groceries._id.toHexString() },
        body: { limitCents: 1_000 },
      }),
    );
    expect((await listBudgets(authed(repos))).body).toHaveLength(1);
  });
});

describe('category routes', () => {
  it('creates a custom category and returns 201', async () => {
    const repos = fakeRepositories();

    const response = await createCategory(authed(repos, { body: { name: '  Pets  ' } }));

    expect(response.status).toBe(201);
    // Sanitised on the way in, exactly as a typed expense description is.
    expect(response.body).toMatchObject({ name: 'Pets', isCustom: true });
    expect(repos.state.categories[0]?.nameKey).toBe('pets');
  });

  it('returns categories sorted by name', async () => {
    const repos = fakeRepositories({
      categories: [category('Travel'), category('Dining'), category('Groceries')],
    });

    const response = await listCategories(authed(repos));

    expect((response.body as { name: string }[]).map((c) => c.name)).toEqual([
      'Dining',
      'Groceries',
      'Travel',
    ]);
  });
});

describe('the fake and the real repository agree on shape', () => {
  /**
   * A fake that drifts from the interface is worse than no fake: the tests stay
   * green while the thing they stand for changes underneath them. TypeScript
   * catches that here, because `fakeRepositories` is typed as `Repositories` -
   * this test simply pins the surface so a reader can see what is covered.
   */
  it('implements every method the routes rely on', () => {
    const repos = fakeRepositories();
    expect(Object.keys(repos.expenses).sort()).toEqual([
      'countInRange',
      'findById',
      'insert',
      'list',
      'remove',
      'totalsByCategory',
      'totalsByMonth',
      'update',
    ]);
    expect(Object.keys(repos.budgets).sort()).toEqual(['list', 'remove', 'set']);
    expect(Object.keys(repos.categories).sort()).toEqual(['exists', 'insert', 'list']);
  });
});
