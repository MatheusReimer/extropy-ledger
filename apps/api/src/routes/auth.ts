import {
  PREDEFINED_CATEGORIES,
  loginSchema,
  signupSchema,
  type AuthResponse,
} from '@expense/shared';
import { ObjectId } from 'mongodb';
import { getCollections } from '../db/client.js';
import { toUserDto } from '../db/mappers.js';
import type { CategoryDoc } from '../db/types.js';
import { conflict, unauthorized } from '../http/errors.js';
import type { Handler } from '../http/types.js';
import { parseInput } from '../http/validate.js';
import { signAccessToken } from '../lib/jwt.js';
import { hashPassword, verifyPassword } from '../lib/password.js';

/**
 * A throwaway hash, to equalise response time when the email does not exist.
 *
 * Without it, "unknown email" answers in 1 ms and "wrong password" in 100 ms - a
 * gap wide enough to enumerate accounts by timing the login (OWASP A07). It
 * costs one pointless scrypt on the error path; that is the price of the two
 * cases being indistinguishable from outside.
 */
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

export const signup: Handler = async (request) => {
  const input = parseInput(signupSchema, request.body);
  const { users, categories } = await getCollections();

  if (await users.findOne({ email: input.email })) {
    throw conflict('An account with this email already exists');
  }

  const doc = {
    _id: new ObjectId(),
    email: input.email,
    passwordHash: await hashPassword(input.password),
    createdAt: new Date(),
  };

  await users.insertOne(doc);
  // A new account with no categories would mean an empty dropdown on first use.
  await categories.insertMany(seedCategories(doc._id));

  const body: AuthResponse = {
    token: await signAccessToken(doc._id.toHexString()),
    user: toUserDto(doc),
  };
  return { status: 201, body };
};

export const login: Handler = async (request) => {
  const input = parseInput(loginSchema, request.body);
  const { users } = await getCollections();

  const user = await users.findOne({ email: input.email });
  const valid = await verifyPassword(input.password, user?.passwordHash ?? (await getDummyHash()));

  // Identical message in both cases, for the same reason as the throwaway hash.
  if (!user || !valid) throw unauthorized('Invalid email or password');

  const body: AuthResponse = {
    token: await signAccessToken(user._id.toHexString()),
    user: toUserDto(user),
  };
  return { status: 200, body };
};
