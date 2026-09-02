import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type {
  AuthResponse,
  BudgetDto,
  CategorizeResult,
  CategoryDto,
  CreateCategoryInput,
  CreateExpenseInput,
  ExpenseDto,
  ExtractReceiptInput,
  ExtractedExpense,
  LoginInput,
  MonthlySummary,
  MonthlyTrendPoint,
  ReceiptDto,
  SignupInput,
  UpdateExpenseInput,
  UserDto,
} from '@expense/shared';
import { apiRequest } from './client';
import { useToken } from '../auth/AuthContext';

/**
 * Centralised cache keys.
 *
 * Scattering string literals is how invalidation starts failing silently: an
 * `['expenses']` in one file and an `['expense']` in another, and the list just
 * stops refreshing after a create.
 */
export const queryKeys = {
  categories: ['categories'] as const,
  budgets: ['budgets'] as const,
  expenses: (filters: ExpenseFilters) => ['expenses', filters] as const,
  summary: (month: string) => ['summary', month] as const,
  trend: (to: string, months: number) => ['trend', to, months] as const,
  rate: (to: string) => ['rate', to] as const,
};

export type ExpenseFilters = {
  from?: string | undefined;
  to?: string | undefined;
  categoryId?: string | undefined;
};

export function useCategories(): UseQueryResult<CategoryDto[]> {
  const token = useToken();
  return useQuery({
    queryKey: queryKeys.categories,
    queryFn: () => apiRequest<CategoryDto[]>('/categories', { token }),
    enabled: Boolean(token),
  });
}

export function useExpenses(filters: ExpenseFilters): UseQueryResult<ExpenseDto[]> {
  const token = useToken();
  return useQuery({
    queryKey: queryKeys.expenses(filters),
    queryFn: () => apiRequest<ExpenseDto[]>('/expenses', { token, query: filters }),
    enabled: Boolean(token),
  });
}

/**
 * Anchored to the selected month, not to today.
 *
 * The chart has to agree with the figures beside it: viewing August and being
 * shown a window ending in September would be two panels disagreeing about what
 * "now" means.
 */
export function useTrend(to: string, months: number): UseQueryResult<MonthlyTrendPoint[]> {
  const token = useToken();
  return useQuery({
    queryKey: queryKeys.trend(to, months),
    queryFn: () =>
      apiRequest<MonthlyTrendPoint[]>('/reports/trend', {
        token,
        query: { to, months: String(months) },
      }),
    enabled: Boolean(token),
  });
}

export function useMonthlySummary(month: string): UseQueryResult<MonthlySummary> {
  const token = useToken();
  return useQuery({
    queryKey: queryKeys.summary(month),
    queryFn: () => apiRequest<MonthlySummary>('/reports/summary', { token, query: { month } }),
    enabled: Boolean(token),
  });
}

/**
 * Every expense mutation invalidates expenses AND the summary.
 *
 * They are two readings of the same data: if only the list refreshed, the chart
 * would keep showing a total that disagrees with the table right below it.
 */
function useExpenseMutation<TInput, TResult>(
  mutationFn: (token: string | undefined, input: TInput) => Promise<TResult>,
) {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TInput) => mutationFn(token, input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['expenses'] }),
        queryClient.invalidateQueries({ queryKey: ['summary'] }),
        // The trend is a third reading of the same data - leave it out and a new
        // expense shows in the table and the totals but not in the chart.
        queryClient.invalidateQueries({ queryKey: ['trend'] }),
      ]);
    },
  });
}

export const useCreateExpense = () =>
  useExpenseMutation((token, input: CreateExpenseInput) =>
    apiRequest<ExpenseDto>('/expenses', { method: 'POST', body: input, token }),
  );

export const useUpdateExpense = () =>
  useExpenseMutation((token, input: UpdateExpenseInput & { id: string }) => {
    const { id, ...changes } = input;
    return apiRequest<ExpenseDto>(`/expenses/${id}`, { method: 'PATCH', body: changes, token });
  });

export const useDeleteExpense = () =>
  useExpenseMutation((token, id: string) =>
    apiRequest<void>(`/expenses/${id}`, { method: 'DELETE', token }),
  );

export function useBudgets(): UseQueryResult<BudgetDto[]> {
  const token = useToken();
  return useQuery({
    queryKey: queryKeys.budgets,
    queryFn: () => apiRequest<BudgetDto[]>('/budgets', { token }),
    enabled: Boolean(token),
  });
}

/**
 * Setting and clearing a budget share one hook.
 *
 * `limitCents: null` clears it, which keeps the two operations - and their cache
 * invalidation - in one place rather than two hooks that must remember to
 * invalidate identically.
 */
export function useSetBudget() {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      categoryId,
      limitCents,
    }: {
      categoryId: string;
      limitCents: number | null;
    }): Promise<void> => {
      if (limitCents === null) {
        await apiRequest<void>(`/budgets/${categoryId}`, { method: 'DELETE', token });
        return;
      }
      await apiRequest<BudgetDto>(`/budgets/${categoryId}`, {
        method: 'PUT',
        body: { limitCents },
        token,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.budgets });
    },
  });
}

export function useCreateCategory() {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCategoryInput) =>
      apiRequest<CategoryDto>('/categories', { method: 'POST', body: input, token }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.categories });
    },
  });
}

/**
 * Categorisation is a MUTATION, not a query.
 *
 * A query would imply automatic refetching - on window focus, on reconnect - and
 * every refetch is a potentially paid API call. As a mutation it fires once,
 * when the user's action asks for it.
 */
export function useCategorize() {
  const token = useToken();
  return useMutation({
    mutationFn: (input: { description: string; amountCents?: number }) =>
      apiRequest<CategorizeResult>('/ai/categorize', { method: 'POST', body: input, token }),
  });
}

export const useSignup = () =>
  useMutation({
    mutationFn: (input: SignupInput) =>
      apiRequest<AuthResponse>('/auth/signup', { method: 'POST', body: input }),
  });

export const useLogin = () =>
  useMutation({
    mutationFn: (input: LoginInput) =>
      apiRequest<AuthResponse>('/auth/login', { method: 'POST', body: input }),
  });

/**
 * Reading a receipt is a mutation for the same reason categorising is: it is an
 * explicit user action with a cost, and a query would refetch it on window focus.
 */
export function useExtractReceipt() {
  const token = useToken();
  return useMutation({
    mutationFn: (input: ExtractReceiptInput) =>
      apiRequest<ExtractedExpense>('/ai/extract-receipt', { method: 'POST', body: input, token }),
  });
}

/**
 * Fetched only when a receipt is actually opened.
 *
 * A 4 MB base64 payload per row would be absurd to prefetch, so `enabled` keeps
 * it dormant until the dialog asks. The result is cached, so reopening the same
 * receipt is instant.
 */
export function useReceipt(receiptId: string | undefined) {
  const token = useToken();
  return useQuery({
    queryKey: ['receipt', receiptId],
    queryFn: () => apiRequest<ReceiptDto>(`/receipts/${receiptId}`, { token }),
    enabled: Boolean(token && receiptId),
    staleTime: 5 * 60_000,
  });
}

type LatestRate = { base: string; to: string; rate: number | null; asOf: string | null };

/**
 * The base-to-display rate for the whole session.
 *
 * One query, one rate, used for every converted figure on screen - which is what
 * keeps rows and totals adding up. Skipped entirely when the display currency IS
 * the base, because there is nothing to ask.
 */
export function useRate(displayCurrency: string) {
  const token = useToken();
  return useQuery({
    queryKey: queryKeys.rate(displayCurrency),
    queryFn: () => apiRequest<LatestRate>('/rates', { token, query: { to: displayCurrency } }),
    enabled: Boolean(token) && displayCurrency !== 'USD',
    // Rates move slowly and the server caches them for six hours anyway;
    // refetching on every mount would add a request that cannot change anything.
    staleTime: 30 * 60_000,
  });
}

/**
 * Preferences change how amounts are READ, so everything that renders money has
 * to be refetched - but nothing is rewritten server-side.
 */
export function useUpdatePreferences() {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { displayCurrency?: string; locale?: string }) =>
      apiRequest<UserDto>('/me/preferences', { method: 'PATCH', body: input, token }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['rate'] });
    },
  });
}
