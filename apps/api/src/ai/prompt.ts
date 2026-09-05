import { minorUnitsToDecimalString } from '@expense/shared';

export function buildSystemPrompt(categories: readonly string[]): string {
  return [
    'You classify a personal expense into exactly one category.',
    `Allowed categories: ${categories.join(', ')}.`,
    'Pick the category a careful bookkeeper would pick from the merchant or description.',
    'Report confidence honestly: below 0.5 when the description is vague or could fit several categories.',
  ].join('\n');
}

export function buildUserPrompt(input: {
  description: string;
  amountCents?: number | undefined;
}): string {
  const amount =
    input.amountCents === undefined
      ? ''
      : `\nAmount: ${minorUnitsToDecimalString(input.amountCents)}`;
  return `Expense description: ${input.description}${amount}`;
}
