import type { Binary, ObjectId } from 'mongodb';

export type UserDoc = {
  _id: ObjectId;
  email: string;
  passwordHash: string;
  createdAt: Date;
  displayCurrency?: string | undefined;
  locale?: string | undefined;
};

export type CategoryDoc = {
  _id: ObjectId;
  userId: ObjectId;
  name: string;
  nameKey: string;
  isCustom: boolean;
  createdAt: Date;
};

export type BudgetDoc = {
  _id: ObjectId;
  userId: ObjectId;
  categoryId: ObjectId;
  limitCents: number;
  createdAt: Date;
  updatedAt: Date;
};

export type ExpenseDoc = {
  _id: ObjectId;
  userId: ObjectId;
  amountCents: number;
  currency: string;
  baseCents: number | null;
  rate?: number | undefined;
  rateAsOf?: string | undefined;
  description: string;
  categoryId: ObjectId;
  date: string;
  createdAt: Date;
  updatedAt: Date;
  receiptId?: ObjectId | undefined;
};

export type ReceiptDoc = {
  _id: ObjectId;
  userId: ObjectId;
  mimeType: string;
  fileName: string;
  bytes: number;
  data: Binary;
  createdAt: Date;
  expiresAt?: Date | undefined;
};

export type RateDoc = {
  _id: string;
  rate: number;
  asOf: string;
  fetchedAt: Date;
  expiresAt?: Date | undefined;
};
