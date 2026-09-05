export type CategoryDto = {
  id: string;
  name: string;
  isCustom: boolean;
};

export type ExpenseDto = {
  id: string;
  amountCents: number;
  currency: string;
  baseCents: number | null;
  description: string;
  categoryId: string;
  date: string;
  createdAt: string;
  receiptId?: string;
};

export type ReceiptDto = {
  id: string;
  mimeType: string;
  fileName: string;
  data: string;
};

export type UserDto = {
  id: string;
  email: string;
  displayCurrency: string;
  locale: string;
};

export type AuthResponse = {
  token: string;
  user: UserDto;
};

export type BudgetDto = {
  categoryId: string;
  limitCents: number;
};

export type CategoryBreakdown = {
  categoryId: string;
  name: string;
  totalCents: number;
  count: number;
};

export type MonthlySummary = {
  month: string;
  totalCents: number;
  expenseCount: number;
  byCategory: CategoryBreakdown[];
  unconvertedCount: number;
};

export type MonthlyTrendPoint = {
  month: string;
  totalCents: number;
  expenseCount: number;
};

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
  };
};
