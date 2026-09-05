import { requireAuth } from '../middleware/auth.js';
import type { Route } from '../http/types.js';
import { login, signup } from './auth.js';
import { deleteBudget, listBudgets, setBudget } from './budgets.js';
import { createCategory, deleteCategory, listCategories, renameCategory } from './categories.js';
import { createExpense, deleteExpense, listExpenses, updateExpense } from './expenses.js';
import { monthlySummary, monthlyTrend } from './reports.js';
import { categorizeExpense, extractExpenseFromReceipt } from './ai.js';
import { getReceipt } from './receipts.js';
import { updatePreferences } from './preferences.js';
import { latestRate } from './rates.js';

export const routes: readonly Route[] = [
  {
    method: 'GET',
    path: '/health',
    handler: async () => ({ status: 200, body: { status: 'ok' } }),
  },

  { method: 'POST', path: '/auth/signup', handler: signup() },
  { method: 'POST', path: '/auth/login', handler: login() },

  { method: 'GET', path: '/expenses', handler: requireAuth(listExpenses) },
  { method: 'POST', path: '/expenses', handler: requireAuth(createExpense) },
  { method: 'PATCH', path: '/expenses/:id', handler: requireAuth(updateExpense) },
  { method: 'DELETE', path: '/expenses/:id', handler: requireAuth(deleteExpense) },

  { method: 'GET', path: '/categories', handler: requireAuth(listCategories) },
  { method: 'POST', path: '/categories', handler: requireAuth(createCategory) },
  { method: 'PATCH', path: '/categories/:id', handler: requireAuth(renameCategory) },
  { method: 'DELETE', path: '/categories/:id', handler: requireAuth(deleteCategory) },

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
