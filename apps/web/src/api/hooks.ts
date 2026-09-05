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
  RenameCategoryInput,
  SignupInput,
  UpdateExpenseInput,
  UserDto,
} from '@expense/shared';
import { apiRequest } from './client';
import { useToken } from '../auth/AuthContext';

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

function useCategoryMutation<TInput, TResult>(
  mutationFn: (token: string | undefined, input: TInput) => Promise<TResult>,
) {
  const token = useToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TInput) => mutationFn(token, input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.categories }),
        queryClient.invalidateQueries({ queryKey: queryKeys.budgets }),
        queryClient.invalidateQueries({ queryKey: ['summary'] }),
      ]);
    },
  });
}

export const useRenameCategory = () =>
  useCategoryMutation((token, input: RenameCategoryInput & { id: string }) => {
    const { id, ...changes } = input;
    return apiRequest<CategoryDto>(`/categories/${id}`, { method: 'PATCH', body: changes, token });
  });

export const useDeleteCategory = () =>
  useCategoryMutation((token, id: string) =>
    apiRequest<void>(`/categories/${id}`, { method: 'DELETE', token }),
  );

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

export function useExtractReceipt() {
  const token = useToken();
  return useMutation({
    mutationFn: (input: ExtractReceiptInput) =>
      apiRequest<ExtractedExpense>('/ai/extract-receipt', { method: 'POST', body: input, token }),
  });
}

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

export function useRate(displayCurrency: string) {
  const token = useToken();
  return useQuery({
    queryKey: queryKeys.rate(displayCurrency),
    queryFn: () => apiRequest<LatestRate>('/rates', { token, query: { to: displayCurrency } }),
    enabled: Boolean(token) && displayCurrency !== 'USD',
    staleTime: 30 * 60_000,
  });
}

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
