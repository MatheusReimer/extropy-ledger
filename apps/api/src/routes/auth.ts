import {
  PREDEFINED_CATEGORIES,
  loginSchema,
  signupSchema,
  type AuthResponse,
} from '@expense/shared';
import { ObjectId } from 'mongodb';
import { accountRepository } from '../db/repositories/mongo.js';
import type { AccountRepository } from '../db/repositories/types.js';
import { toUserDto } from '../db/mappers.js';
import type { CategoryDoc } from '../db/types.js';
import { conflict, unauthorized } from '../http/errors.js';
import type { Handler } from '../http/types.js';
import { parseInput } from '../http/validate.js';
import { signAccessToken } from '../lib/jwt.js';
import { hashPassword, verifyPassword } from '../lib/password.js';

type BuildAccounts = () => Promise<AccountRepository>;

let dummyHash: Promise<string> | undefined;
const getDummyHash = (): Promise<string> => (dummyHash ??= hashPassword('never-matches'));

const seedCategories = (userId: ObjectId): CategoryDoc[] =>
  PREDEFINED_CATEGORIES.map((name) => ({
    _id: new ObjectId(),
    userId,
    name,
    nameKey: name.toLowerCase(),
    isCustom: false,
    createdAt: new Date(),
  }));

export function signup(buildAccounts: BuildAccounts = accountRepository): Handler {
  return async (request) => {
    const input = parseInput(signupSchema, request.body);
    const accounts = await buildAccounts();

    if (await accounts.findByEmail(input.email)) {
      throw conflict('An account with this email already exists');
    }

    const doc = {
      _id: new ObjectId(),
      email: input.email,
      passwordHash: await hashPassword(input.password),
      createdAt: new Date(),
    };

    await accounts.create(doc, seedCategories(doc._id));

    const body: AuthResponse = {
      token: await signAccessToken(doc._id.toHexString()),
      user: toUserDto(doc),
    };
    return { status: 201, body };
  };
}

export function login(buildAccounts: BuildAccounts = accountRepository): Handler {
  return async (request) => {
    const input = parseInput(loginSchema, request.body);
    const accounts = await buildAccounts();

    const user = await accounts.findByEmail(input.email);
    const valid = await verifyPassword(
      input.password,
      user?.passwordHash ?? (await getDummyHash()),
    );

    if (!user || !valid) throw unauthorized('Invalid email or password');

    const body: AuthResponse = {
      token: await signAccessToken(user._id.toHexString()),
      user: toUserDto(user),
    };
    return { status: 200, body };
  };
}
