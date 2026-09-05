import { ObjectId } from 'mongodb';
import type {
  BudgetDoc,
  CategoryDoc,
  ExpenseDoc,
  RateDoc,
  ReceiptDoc,
  UserDoc,
} from '../../src/db/types.js';
import type { AccountRepository, Repositories } from '../../src/db/repositories/types.js';

/**
 * An in-memory stand-in for the persistence layer.
 *
 * This is the payoff from the repositories: route handlers depend on an
 * interface rather than on MongoDB, so they can be exercised with real inputs
 * and real assertions in milliseconds, with no database and no container.
 *
 * Deliberately NOT a mock library. These are working implementations over
 * arrays, so a test asserts on what the handler DID - the row is gone, the
 * budget holds the new number - rather than on which method it happened to call.
 * Tests that assert on calls pass when the behaviour is wrong.
 *
 * One thing it does not model: cross-user isolation. It cannot, because the real
 * repositories take no user id - the scope is bound before a handler ever sees
 * them. That guarantee is structural rather than behavioural, which is precisely
 * why it does not need a test to hold.
 */
export type Seed = {
  expenses?: ExpenseDoc[];
  categories?: CategoryDoc[];
  budgets?: BudgetDoc[];
  receipts?: ReceiptDoc[];
  rates?: RateDoc[];
  user?: UserDoc;
};

export type FakeRepositories = Repositories & {
  /** The current contents, for asserting on what a handler left behind. */
  readonly state: Required<Omit<Seed, 'user'>> & { user: UserDoc | undefined };
};

/**
 * A shallow copy, deliberately NOT `structuredClone`.
 *
 * `structuredClone` deep-clones an ObjectId into a plain object and strips its
 * prototype, so `_id.toHexString()` disappears and every test fails on a method
 * that exists in production. Shallow is also all that is needed: it stops a
 * caller mutating stored state through a returned reference, which is the only
 * property being bought here.
 */
const clone = <T extends object>(value: T): T => ({ ...value });

export function fakeRepositories(seed: Seed = {}): FakeRepositories {
  const state = {
    expenses: seed.expenses ? [...seed.expenses] : [],
    categories: seed.categories ? [...seed.categories] : [],
    budgets: seed.budgets ? [...seed.budgets] : [],
    receipts: seed.receipts ? [...seed.receipts] : [],
    rates: seed.rates ? [...seed.rates] : [],
    user: seed.user,
  };

  const inRange = (doc: ExpenseDoc, from: string, to: string) => doc.date >= from && doc.date <= to;

  return {
    state,

    expenses: {
      async list(filter) {
        return state.expenses
          .filter((e) => (filter.from ? e.date >= filter.from : true))
          .filter((e) => (filter.to ? e.date <= filter.to : true))
          .filter((e) => (filter.categoryId ? e.categoryId.equals(filter.categoryId) : true))
          .sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1))
          .slice(0, filter.limit)
          .map(clone);
      },
      async findById(id) {
        return state.expenses.find((e) => e._id.equals(id)) ?? null;
      },
      async insert(doc) {
        state.expenses.push(clone(doc));
      },
      async update(id, changes) {
        const found = state.expenses.find((e) => e._id.equals(id));
        if (!found) return null;
        Object.assign(found, changes);
        return clone(found);
      },
      async remove(id) {
        const index = state.expenses.findIndex((e) => e._id.equals(id));
        if (index === -1) return null;
        return state.expenses.splice(index, 1)[0] ?? null;
      },
      async countByCategory(categoryId) {
        return state.expenses.filter((e) => e.categoryId.equals(categoryId)).length;
      },
      async countUnconverted(from, to) {
        return state.expenses.filter((e) => inRange(e, from, to) && e.baseCents === null).length;
      },
      async totalsByCategory(from, to) {
        const totals = new Map<
          string,
          { categoryId: ObjectId; totalCents: number; count: number }
        >();
        for (const e of state.expenses) {
          if (!inRange(e, from, to) || e.baseCents === null) continue;
          const key = e.categoryId.toHexString();
          const row = totals.get(key) ?? { categoryId: e.categoryId, totalCents: 0, count: 0 };
          row.totalCents += e.baseCents;
          row.count += 1;
          totals.set(key, row);
        }
        return [...totals.values()];
      },
      async totalsByMonth(from, to) {
        const totals = new Map<string, { month: string; totalCents: number; count: number }>();
        for (const e of state.expenses) {
          if (!inRange(e, from, to) || e.baseCents === null) continue;
          const month = e.date.slice(0, 7);
          const row = totals.get(month) ?? { month, totalCents: 0, count: 0 };
          row.totalCents += e.baseCents;
          row.count += 1;
          totals.set(month, row);
        }
        return [...totals.values()];
      },
    },

    categories: {
      async list() {
        return [...state.categories].sort((a, b) => a.name.localeCompare(b.name)).map(clone);
      },
      async findById(id) {
        const found = state.categories.find((c) => c._id.equals(id));
        return found ? clone(found) : null;
      },
      async insert(doc) {
        state.categories.push(clone(doc));
      },
      async exists(id) {
        return state.categories.some((c) => c._id.equals(id));
      },
      async rename(id, name, nameKey) {
        const found = state.categories.find((c) => c._id.equals(id));
        if (!found) return null;
        found.name = name;
        found.nameKey = nameKey;
        return clone(found);
      },
      async remove(id) {
        const index = state.categories.findIndex((c) => c._id.equals(id));
        if (index === -1) return false;
        state.categories.splice(index, 1);
        return true;
      },
    },

    budgets: {
      async list() {
        return state.budgets.map(clone);
      },
      async set(categoryId, limitCents) {
        const found = state.budgets.find((b) => b.categoryId.equals(categoryId));
        if (found) {
          found.limitCents = limitCents;
          found.updatedAt = new Date();
          return clone(found);
        }
        const doc: BudgetDoc = {
          _id: new ObjectId(),
          userId: new ObjectId(),
          categoryId,
          limitCents,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        state.budgets.push(doc);
        return clone(doc);
      },
      async remove(categoryId) {
        const index = state.budgets.findIndex((b) => b.categoryId.equals(categoryId));
        if (index === -1) return false;
        state.budgets.splice(index, 1);
        return true;
      },
    },

    receipts: {
      async findById(id) {
        return state.receipts.find((r) => r._id.equals(id)) ?? null;
      },
      async insert(doc) {
        state.receipts.push(clone(doc));
      },
      async claim(id) {
        const found = state.receipts.find((r) => r._id.equals(id));
        if (!found) return false;
        delete found.expiresAt;
        return true;
      },
      async remove(id) {
        const index = state.receipts.findIndex((r) => r._id.equals(id));
        if (index !== -1) state.receipts.splice(index, 1);
      },
    },

    rates: {
      async find(key) {
        return state.rates.find((r) => r._id === key) ?? null;
      },
      async save(doc) {
        const index = state.rates.findIndex((r) => r._id === doc._id);
        if (index === -1) state.rates.push(clone(doc));
        else state.rates[index] = clone(doc);
      },
    },

    user: {
      async find() {
        return state.user ?? null;
      },
      async updatePreferences(changes) {
        if (!state.user) return null;
        Object.assign(state.user, changes);
        return clone(state.user);
      },
    },
  };
}

/**
 * An in-memory stand-in for the UNSCOPED account repository.
 *
 * Separate from `fakeRepositories` for the same reason the real one is separate:
 * sign-up and log-in run before there is a user to scope to, so they cannot be
 * handed a user-scoped repository. Keeping the two apart in the fakes as well
 * means a test cannot accidentally prove something the production wiring could
 * never do.
 */
export type FakeAccounts = AccountRepository & {
  readonly state: { users: UserDoc[]; categories: CategoryDoc[] };
};

export function fakeAccounts(users: UserDoc[] = []): FakeAccounts {
  const state = { users: [...users], categories: [] as CategoryDoc[] };

  return {
    state,
    async findByEmail(email) {
      return state.users.find((u) => u.email === email) ?? null;
    },
    async create(user, categories) {
      state.users.push(clone(user));
      state.categories.push(...categories.map(clone));
    },
  };
}
