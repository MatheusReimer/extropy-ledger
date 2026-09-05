import { CURRENCIES, LOCALES, type UserDto } from '@expense/shared';
import { z } from 'zod';
import { toUserDto } from '../db/mappers.js';
import { notFound } from '../http/errors.js';
import type { AuthedHandler } from '../http/types.js';
import { parseInput } from '../http/validate.js';

const preferencesSchema = z
  .object({
    displayCurrency: z.enum(CURRENCIES).optional(),
    locale: z.enum(LOCALES).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one preference');

export const updatePreferences: AuthedHandler = async (request) => {
  const input = parseInput(preferencesSchema, request.body);
  const updated = await request.repos.user.updatePreferences(input);
  if (!updated) throw notFound('Account not found');

  const body: UserDto = toUserDto(updated);
  return { status: 200, body };
};
