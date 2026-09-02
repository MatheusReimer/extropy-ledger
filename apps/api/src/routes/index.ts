import { requireAuth } from '../middleware/auth.js';
import type { Route } from '../http/types.js';
import { login, signup } from './auth.js';
import { deleteBudget, listBudgets, setBudget } from './budgets.js';
import { createCategory, listCategories } from './categories.js';
import { createExpense, deleteExpense, listExpenses, updateExpense } from './expenses.js';
import { monthlySummary } from './reports.js';
import { monthlyTrend } from './trend.js';
import { categorizeExpense, extractExpenseFromReceipt } from './ai.js';
import { getReceipt } from './receipts.js';
import { latestRate, updatePreferences } from './preferences.js';

/**
 * An explicit route table.
 *
 * No filesystem discovery, no decorators: you can read every route and see
 * which ones require authentication on a single screen. A new route missing
 * `requireAuth` is visible in review, which is exactly where that mistake needs
 * to be caught.
 */
export const routes: readonly Route[] = [
  // Deliberately touches nothing: a health check that needs the database cannot
  // tell "the API is down" apart from "Mongo is down".
  { method: 'GET', path: '/health', handler: async () => ({ status: 200, body: { status: 'ok' } }) },

  { method: 'POST', path: '/auth/signup', handler: signup },
  { method: 'POST', path: '/auth/login', handler: login },

  { method: 'GET', path: '/expenses', handler: requireAuth(listExpenses) },
  { method: 'POST', path: '/expenses', handler: requireAuth(createExpense) },
  { method: 'PATCH', path: '/expenses/:id', handler: requireAuth(updateExpense) },
  { method: 'DELETE', path: '/expenses/:id', handler: requireAuth(deleteExpense) },

  { method: 'GET', path: '/categories', handler: requireAuth(listCategories) },
  { method: 'POST', path: '/categories', handler: requireAuth(createCategory) },

  { method: 'GET', path: '/budgets', handler: requireAuth(listBudgets) },
  { method: 'PUT', path: '/budgets/:categoryId', handler: requireAuth(setBudget) },
  { method: 'DELETE', path: '/budgets/:categoryId', handler: requireAuth(deleteBudget) },

  { method: 'GET', path: '/reports/summary', handler: requireAuth(monthlySummary) },
  { method: 'GET', path: '/reports/trend', handler: requireAuth(monthlyTrend) },

  { method: 'POST', path: '/ai/categorize', handler: requireAuth(categorizeExpense) },
  { method: 'POST', path: '/ai/extract-receipt', handler: requireAuth(extractExpenseFromReceipt) },

  { method: 'GET', path: '/receipts/:id', handler: requireAuth(getReceipt) },

  { method: 'PATCH', path: '/me/preferences', handler: requireAuth(updatePreferences) },
  { method: 'GET', path: '/rates', handler: requireAuth(latestRate) },
];
